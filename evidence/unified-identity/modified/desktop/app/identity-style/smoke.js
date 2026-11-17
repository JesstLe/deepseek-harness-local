import {smokeFragmentShader,smokeVertexShader} from './smoke-shader.js';
export function mountSmoke() {
    const canvas = document.querySelector(".auth-smoke-canvas");
    if (!canvas)
        return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(pointer: fine)");
    const small = matchMedia("(max-width: 800px)");
    let dispose;
    const initialize = () => {
        dispose?.();
        canvas.dataset.smoke = "fallback";
        const gl = canvas.getContext("webgl", {
            antialias: false,
            alpha: false,
            depth: false,
            powerPreference: "low-power",
            preserveDrawingBuffer: false,
        });
        if (!gl || gl.isContextLost())
            return;
        const shaders = [];
        let program = null, buffer = null;
        let frame = 0, last = 0, elapsed = 40, visible = true, disposed = false;
        const pointer = { x: 0.7, y: 0.4, tx: 0.7, ty: 0.4 };
        const release = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            if (buffer)
                gl.deleteBuffer(buffer);
            if (program)
                gl.deleteProgram(program);
            shaders.forEach((shader) => gl.deleteShader(shader));
        };
        try {
            for (const [type, source] of [
                [gl.VERTEX_SHADER, smokeVertexShader],
                [gl.FRAGMENT_SHADER, smokeFragmentShader],
            ]) {
                const shader = gl.createShader(type);
                if (!shader)
                    throw Error("shader allocation");
                shaders.push(shader);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                    throw Error("shader compile");
            }
            program = gl.createProgram();
            if (!program)
                throw Error("program allocation");
            shaders.forEach((shader) => gl.attachShader(program, shader));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                throw Error("program link");
            gl.useProgram(program);
            buffer = gl.createBuffer();
            if (!buffer)
                throw Error("buffer allocation");
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, "a");
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        }
        catch {
            release();
            return;
        }
        const resolution = gl.getUniformLocation(program, "uRes"), time = gl.getUniformLocation(program, "uTime"), mouse = gl.getUniformLocation(program, "uMouse"), dark = gl.getUniformLocation(program, "uDark");
        const draw = () => {
            if (disposed || gl.isContextLost())
                return;
            gl.uniform2f(resolution, canvas.width, canvas.height);
            gl.uniform1f(time, elapsed);
            gl.uniform2f(mouse, pointer.x, pointer.y);
            gl.uniform1f(dark, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            canvas.dataset.smoke = "ready";
        };
        const animate = (now) => {
            frame = requestAnimationFrame(animate);
            if (now - last < 1000 / 30)
                return;
            const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
            last = now;
            elapsed += dt;
            pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.2);
            pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.2);
            draw();
        };
        const play = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            last = 0;
            if (!visible || document.hidden || disposed)
                return;
            if (motion.matches || small.matches) {
                draw();
                return;
            }
            frame = requestAnimationFrame(animate);
        };
        const move = (event) => {
            if (!fine.matches ||
                motion.matches ||
                small.matches ||
                event.pointerType !== "mouse")
                return;
            const bounds = canvas.getBoundingClientRect();
            pointer.tx = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
            pointer.ty =
                1 -
                    Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
        };
        const reset = () => {
            pointer.tx = 0.7;
            pointer.ty = 0.4;
        };
        const resize = new ResizeObserver(() => {
            const ratio = Math.min(devicePixelRatio || 1, 1.5) * 0.55;
            canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
            canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
            gl.viewport(0, 0, canvas.width, canvas.height);
            draw();
        });
        const intersection = new IntersectionObserver((entries) => {
            visible = entries[0]?.isIntersecting ?? false;
            play();
        });
        resize.observe(canvas);
        intersection.observe(canvas);
        const surface = canvas.closest("main") ?? canvas;
        surface.addEventListener("pointermove", move, {
            passive: true,
        });
        surface.addEventListener("pointerleave", reset);
        document.addEventListener("visibilitychange", play);
        motion.addEventListener("change", play);
        small.addEventListener("change", play);
        play();
        dispose = () => {
            disposed = true;
            release();
            resize.disconnect();
            intersection.disconnect();
            surface.removeEventListener("pointermove", move);
            surface.removeEventListener("pointerleave", reset);
            document.removeEventListener("visibilitychange", play);
            motion.removeEventListener("change", play);
            small.removeEventListener("change", play);
        };
    };
    const lost = (event) => {
        event.preventDefault();
        dispose?.();
        canvas.dataset.smoke = "fallback";
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", initialize);
    initialize();
    return () => {
        dispose?.();
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", initialize);
    };
}
