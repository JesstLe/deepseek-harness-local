"""Naumi's local Blender bridge. stdlib+bpy only; no user preferences or network services.
Core command names follow ahujasid/blender-mcp; transport/auth/lifecycle are Naumi-owned.
"""
import bpy
import socket, threading, queue, json, os, sys, time, uuid, hmac, hashlib, io, contextlib, traceback

MAX_BYTES = 1024 * 1024

class Bridge:
    def __init__(self, spec):
        self.spec = spec
        self.home = spec['home']
        self.instance = spec['instanceId']
        self.token = spec['token'].encode()
        self.work = queue.Queue(maxsize=32)
        self.running = True
        self.ledger_path = os.path.join(self.home, 'receipts.json')
        try:
            with open(self.ledger_path, encoding='utf-8') as f:
                self.records = json.load(f)
        except FileNotFoundError:
            self.records = {}
        if not isinstance(self.records, dict):
            raise RuntimeError('BLENDER_LEDGER_INVALID')
        for r in self.records.values():
            if r.get('state') in ('accepted', 'running'):
                r['state'] = 'unknown'
        self.persist()
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.bind(('127.0.0.1', 0))
        self.socket.listen(8)
        self.socket.settimeout(1)
        self.descriptor = {'version': 1, 'pid': os.getpid(), 'port': self.socket.getsockname()[1],
                           'instanceId': self.instance, 'token': spec['token']}
        self.atomic(os.path.join(self.home, 'active.json'), self.descriptor)
        threading.Thread(target=self.accept, daemon=True).start()

    def atomic(self, path, value):
        temp = path + '.' + str(uuid.uuid4()) + '.tmp'
        with open(temp, 'x', encoding='utf-8') as f:
            try:
                os.chmod(temp, 0o600)
            except OSError:
                pass
            json.dump(value, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)

    def persist(self):
        self.atomic(self.ledger_path, self.records)

    def accept(self):
        while self.running:
            try:
                client, _ = self.socket.accept()
                threading.Thread(target=self.handle, args=(client,), daemon=True).start()
            except socket.timeout:
                continue
            except OSError:
                break

    def handle(self, client):
        try:
            client.settimeout(180)
            data = b''
            while b'\n' not in data:
                part = client.recv(16384)
                if not part:
                    return
                data += part
                if len(data) > MAX_BYTES:
                    return
            envelope = json.loads(data.decode())
            raw = envelope['payload']
            signature = hmac.new(self.token, raw.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, envelope.get('mac', '')):
                return
            req = json.loads(raw)
            if req.get('instanceId') != self.instance or not isinstance(req.get('id'), str):
                return
            done = threading.Event()
            item = {'req': req, 'done': done}
            self.work.put(item, timeout=2)
            if not done.wait(175):
                return
            payload = json.dumps({'id': req['id'], 'instanceId': self.instance, **item['answer']}, ensure_ascii=False)
            mac = hmac.new(self.token, payload.encode(), hashlib.sha256).hexdigest()
            client.sendall((json.dumps({'payload': payload, 'mac': mac}) + '\n').encode())
        except Exception:
            pass
        finally:
            client.close()

    def pump(self):
        try:
            item = self.work.get_nowait()
        except queue.Empty:
            return 0.05 if self.running else None
        try:
            req = item['req']
            result = self.command(req)
            item['answer'] = {'status': 'success', 'result': result}
        except Exception as exc:
            code = str(exc)
            item['answer'] = {'status': 'error', 'code': code if code.startswith('BLENDER_') else 'BLENDER_EXECUTION_FAILED'}
        finally:
            item['done'].set()
        return 0.05 if self.running else None

    def command(self, req):
        kind, p = req['type'], req.get('params', {})
        if kind == 'hello':
            return {'name': 'naumi-blender', 'protocol': 1, 'pid': os.getpid(), 'blenderVersion': bpy.app.version_string, 'telemetry': False}
        if kind == 'get_scene_info':
            objects = list(bpy.context.scene.objects)
            return {'scene': bpy.context.scene.name, 'file': bpy.data.filepath, 'objectCount': len(objects),
                    'objects': [{'name': o.name, 'type': o.type, 'location': list(o.location)} for o in objects[:1000]],
                    'truncated': len(objects) > 1000}
        if kind == 'get_object_info':
            o = bpy.data.objects.get(p['name'])
            if o is None:
                raise RuntimeError('BLENDER_OBJECT_NOT_FOUND')
            return {'name': o.name, 'type': o.type, 'location': list(o.location), 'rotation': list(o.rotation_euler),
                    'scale': list(o.scale), 'dimensions': list(o.dimensions)}
        if kind == 'operation_status':
            return self.records.get(p['requestId'], {'state': 'not_found', 'requestId': p['requestId']})
        if kind in ('execute_code', 'render_preview'):
            return self.mutate(req)
        if kind == 'disconnect':
            self.running = False
            self.socket.close()
            # Close only this bridge. A GUI Blender window and its unsaved scene stay open.
            try:
                with open(os.path.join(self.home, 'active.json'), encoding='utf-8') as f:
                    current = json.load(f)
                if current.get('instanceId') == self.instance:
                    os.unlink(os.path.join(self.home, 'active.json'))
            except FileNotFoundError:
                pass
            return {'disconnected': True, 'scenePreserved': True}
        raise RuntimeError('BLENDER_COMMAND_UNKNOWN')

    def mutate(self, req):
        request_id = req['id']
        digest = hashlib.sha256(json.dumps([req['type'], req['params']], sort_keys=True).encode()).hexdigest()
        prior = self.records.get(request_id)
        if prior:
            if prior['digest'] != digest:
                raise RuntimeError('BLENDER_REQUEST_CONFLICT')
            if prior['instanceId'] != self.instance:
                raise RuntimeError('BLENDER_REQUEST_OLD_INSTANCE')
            return prior
        if len(self.records) >= 10000:
            raise RuntimeError('BLENDER_LEDGER_FULL')
        record = {'requestId': request_id, 'instanceId': self.instance, 'digest': digest, 'state': 'running'}
        self.records[request_id] = record
        self.persist()  # durable admission precedes any bpy/filesystem side effect
        try:
            if req['type'] == 'execute_code':
                stream = io.StringIO()
                with contextlib.redirect_stdout(stream):
                    exec(req['params']['code'], {'bpy': bpy, '__name__': '__naumi_blender__'})
                output = stream.getvalue()
                record.update(state='completed', text=output[:MAX_BYTES], truncated=len(output) > MAX_BYTES)
            else:
                record.update(state='completed', imagePath=self.render(request_id, req['params']))
        except Exception as exc:
            record.update(state='failed', error=str(exc)[:4000], traceback=traceback.format_exc()[-8000:])
        self.persist()
        return record

    def render(self, request_id, params):
        scene = bpy.context.scene
        if scene.camera is None:
            raise RuntimeError('BLENDER_CAMERA_REQUIRED')
        render = scene.render
        saved = (render.engine, render.filepath, render.resolution_x, render.resolution_y,
                 render.resolution_percentage, render.image_settings.file_format)
        folder = os.path.join(self.home, 'previews')
        os.makedirs(folder, exist_ok=True)
        target = os.path.join(folder, request_id + '.png')
        try:
            render.engine = 'BLENDER_WORKBENCH'
            render.filepath = target
            render.resolution_x = params.get('width', 640)
            render.resolution_y = params.get('height', 480)
            render.resolution_percentage = 100
            render.image_settings.file_format = 'PNG'
            bpy.ops.render.render(write_still=True)
        finally:
            render.engine, render.filepath, render.resolution_x, render.resolution_y, render.resolution_percentage, render.image_settings.file_format = saved
        return target


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    with open(args[0], encoding='utf-8') as f:
        spec = json.load(f)
    if spec.get('version') != 1:
        raise RuntimeError('BLENDER_BOOTSTRAP_VERSION')
    bridge = Bridge(spec)
    if spec.get('headless'):
        while bridge.running:
            bridge.pump()
            time.sleep(0.01)
        time.sleep(0.2)  # let the final signed reply leave its socket before background Blender exits
    else:
        bpy.app.timers.register(bridge.pump, first_interval=0.05, persistent=True)
        bpy.app.driver_namespace['naumi_blender_bridge'] = bridge

if __name__ == '__main__':
    main()
