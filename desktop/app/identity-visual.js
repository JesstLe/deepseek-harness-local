// Reused Naumi Design Ops optical effects; DOM lifecycle adapter, no form access.
(()=>{
/** Smoke Login shader, Aakash Mehra, MIT. See docs/implementation/SMOKE_LOGIN.md.
 * Adapted from the public 21st.dev live demo; renderer is local and dependency-free.
 */
const smokeVertexShader = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const smokeFragmentShader = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uDark;

float hash(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 r = mat2(.8, .6, -.6, .8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + vec2(1.7, 9.2); a *= .5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float ar = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * ar, uv.y) * 1.25;
  float t = uTime * .07;

  // The pointer stirs a slow eddy into the smoke.
  vec2 d = p - vec2(uMouse.x * ar, uMouse.y) * 1.25;
  float k = exp(-dot(d, d) * 1.6);
  p += vec2(-d.y, d.x) * k * .55;

  // Two rounds of domain warping: the classic recipe for curling, billowing plumes.
  vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t * .8));
  vec2 r = vec2(fbm(p + 3. * q + vec2(1.7, 9.2) + t * 1.2), fbm(p + 3. * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 2.6 * r + vec2(t * .4, -t * .3));

  float smoke = smoothstep(.3, .85, f);
  smoke *= smoke;
  float wisp = smoothstep(.55, .75, f) * (1. - smoothstep(.75, .95, f)); // bright rims on the plumes
  float vein = (1. - smoothstep(.0, .04, abs(f - .58))) * smoothstep(.42, .62, r.y); // acid green thread along a plume edge

  vec3 green = vec3(.62, 1., .23);

  // light: ink smoke on paper
  vec3 paper = vec3(.968, .964, .949);
  vec3 lit = mix(paper, vec3(.07, .08, .07), smoke * .92);
  lit = mix(lit, vec3(.36, .72, .02), vein * .7);
  lit += (1. - smoke) * wisp * .03;

  // dark: pale smoke in the dark, green glowing through it
  vec3 night = mix(vec3(.04, .045, .04), vec3(.03, .035, .03), uv.y);
  vec3 drk = night + vec3(.78, .8, .76) * smoke * .62 + vec3(.9) * wisp * .08;
  drk += green * vein * .8;

  vec3 col = mix(lit, drk, uDark);
  col += (hash(gl_FragCoord.xy + fract(t)) - .5) / 255.; // dither against banding
  gl_FragColor = vec4(col, 1.);
}`;

/** Liquid Glass Navbar shader by Guglielmo Giannattasio / Nimbus UI, MIT.
 * Adapted from the public 21st.dev live demo. See AUTH_LIQUID_CONTROLS.md.
 */
const liquidVertexShader = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const liquidFragmentShader = `
precision highp float;
uniform float uRadius;
uniform vec2 uRes;uniform float uDpr;uniform float uTime;uniform vec4 uPill;
uniform vec4 uBlob[6];uniform float uSy[6];uniform vec4 uRip[6];uniform vec3 uMouse;uniform float uDark;uniform float uAmb;
float sdRB(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float sdCap(vec2 p,vec4 B,float sy){p-=B.xy;p.y/=sy;p.x=max(abs(p.x)-B.z,0.);return(length(p)-B.w)*min(1.,sy);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float dropD(vec2 p){float d=1e4;for(int i=0;i<6;i++){if(uBlob[i].w>.5){d=smin(d,sdCap(p,uBlob[i],uSy[i]),13.);}}return d;}
float pillD(vec2 p){vec2 h=uPill.zw*.5;return sdRB(p-uPill.xy-h,h,min(uRadius,min(h.x,h.y)));}
float lens(float d,float w){float t=clamp(-d/w,0.,1.);return sqrt(1.-(1.-t)*(1.-t));}
float waves(vec2 p){float w=0.;
 for(int i=0;i<6;i++){vec4 R=uRip[i];if(R.w>0.){float x=length(p-R.xy)-R.z*240.;w+=R.w*exp(-R.z*1.7)*sin(x*.3)*exp(-x*x/700.);}}
 vec2 m=p-uMouse.xy;w+=uMouse.z*3.6*exp(-dot(m,m)/1000.);
 w+=uAmb*(sin(p.x*.05+uTime*1.2)*.45+sin(p.x*.13-uTime*.85+p.y*.2)*.25);return w;}
float H(vec2 p){float dp=pillD(p);return lens(dp,uPill.w*.36)*2.4+lens(dropD(p),11.)*7.5+waves(p)*smoothstep(0.,7.,-dp);}
float caus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.1+t),cos(q.x*1.3-t*.7))*.6;c+=1./(1.+16.*abs(sin(q.x)*sin(q.y)));}return c/3.;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y*uDpr-gl_FragCoord.y)/uDpr;
 float dp=pillD(p);float dd=dropD(p);
 float h0=H(p);vec3 n=normalize(vec3(h0-H(p+vec2(1.,0.)),h0-H(p+vec2(0.,1.)),1.));
 vec3 V=vec3(0.,0.,1.);
 float spec=pow(max(dot(reflect(-normalize(vec3(-.45,-.8,.85)),n),V),0.),70.);
 float spec2=pow(max(dot(reflect(-normalize(vec3(.6,.75,.7)),n),V),0.),22.)*.3;
 float fres=clamp((1.-n.z)*4.,0.,1.);
 vec3 irid=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+fres*.85+p.x*.0028+uTime*.035));
 float pm=smoothstep(1.,-1.,dp);float dm=smoothstep(1.,-1.,dd)*smoothstep(1.,-2.,dp);
 float sh=smoothstep(9.,-9.,dropD(p-vec2(0.,5.)))*(1.-dm)*pm*(.11+.07*uDark);
 vec3 c=vec3(0.,.14,.36)*sh;float a=sh;
 float pa=clamp(pm*(fres*.5+spec*.9+spec2),0.,1.);
 c=mix(vec3(1.),irid,.14*fres)*pa+c*(1.-pa);a=pa+a*(1.-pa);
 float th=lens(dd,11.);
 float cs=caus((p+n.xy*th*18.)*.085,uTime*.9);
 vec3 tint=mix(vec3(.80,.95,1.),vec3(.55,.82,1.),uDark);
 float rim=dm*(1.-smoothstep(0.,8.,-dd));
 float cres=dm*smoothstep(.12,.55,dot(n.xy,normalize(vec2(.55,.85))))*smoothstep(0.,3.,-dd);
 float body=.5+.5*clamp(-n.y*3.,-1.,1.);
 float da=dm*(.26+.14*body)*(1.-.35*uDark);vec3 dc=mix(tint,vec3(1.),body*.6);
 float la=rim*.22;vec3 lc=mix(vec3(0.,.42,.78),vec3(.1,.55,.95),uDark);dc=lc*la+dc*da*(1.-la);da=la+da*(1.-la);
 la=clamp(cres*.7+smoothstep(.6,1.,cs)*.28*th*dm,0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=clamp(dm*(spec*1.2+spec2*.5),0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=dm*smoothstep(-2.,0.,dd)*.4;dc=mix(vec3(1.),irid,.1)*la+dc*(1.-la);da=la+da*(1.-la);
 c=dc+c*(1.-da);a=da+a*(1.-da);
 // Never let the rectangular GL backing store contribute outside the capsule.
 float outerMask=1.-smoothstep(-.8,.8,dp);
 c*=outerMask;a*=outerMask;
 if(dp>1.){gl_FragColor=vec4(0.);return;}
 gl_FragColor=vec4(c,a);
}
`;

function mountSmoke() {
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

function mountLiquid(layerElement, optionSelector = '.auth-option', vertical = false) {
    const activeRef = { current: 0 }, refresh = { current: null };
    const root = layerElement, canvas = root?.querySelector("canvas"), surface = root?.parentElement;
    if (!root || !canvas || !surface)
        return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
    const fine = matchMedia("(pointer: fine)");
    let frame = 0, previous = 0, time = 0, visible = true, disposed = false;
    let gl = null, program = null, buffer = null;
    const shaders = [];
    const uniforms = {};
    const state = {
        a: 0,
        av: 0,
        b: 0,
        bv: 0,
        target: 0,
        cross: 0,
        width: 0,
        height: 0,
        q: 0,
        radius: 20,
        ready: false,
        hover: false,
        mouseX: 0,
        mouseY: 0,
        ripple: 0,
        split: false,
    };
    let selected = activeRef.current;
    let surfaceRect = null;
    const options = () => [
        ...surface.querySelectorAll(optionSelector),
    ];
    const target = () => {
        const rect = surface.getBoundingClientRect(), items = options(), item = items[selected];
        surfaceRect = rect;
        const r = item?.getBoundingClientRect() ?? rect;
        state.width = rect.width;
        state.height = rect.height;
        state.target = vertical
            ? r.top - rect.top + r.height / 2
            : r.left - rect.left + r.width / 2;
        state.cross = r.left - rect.left + r.width / 2;
        state.radius = Math.max(1, (r.height - (item ? 0 : 10)) / 2);
        state.q = Math.max(0, (r.width - (item ? 0 : 10)) / 2 - state.radius);
        root.style.setProperty("--liquid-top", `${r.top - rect.top}px`);
        root.style.setProperty("--liquid-height", `${r.height}px`);
        root.style.setProperty("--liquid-left", `${item ? r.left - rect.left : 5}px`);
        root.style.setProperty("--liquid-width", `${r.width - (item ? 0 : 10)}px`);
        if (!state.ready) {
            state.a = state.b = state.target;
            state.ready = true;
        }
    };
    const releaseGL = () => {
        if (gl) {
            if (buffer)
                gl.deleteBuffer(buffer);
            if (program)
                gl.deleteProgram(program);
            shaders.forEach((s) => gl.deleteShader(s));
        }
        shaders.length = 0;
        program = null;
        buffer = null;
        gl = null;
        root.dataset.gl = "off";
    };
    const init = () => {
        releaseGL();
        try {
            gl = canvas.getContext("webgl", {
                alpha: true,
                premultipliedAlpha: true,
                antialias: false,
                depth: false,
                powerPreference: "low-power",
            });
            if (!gl || gl.isContextLost())
                return;
            for (const [type, source] of [
                [gl.VERTEX_SHADER, liquidVertexShader],
                [gl.FRAGMENT_SHADER, liquidFragmentShader],
            ]) {
                const s = gl.createShader(type);
                if (!s)
                    throw Error("shader allocation");
                shaders.push(s);
                gl.shaderSource(s, source);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                    throw Error("shader compile");
            }
            program = gl.createProgram();
            if (!program)
                throw Error("program allocation");
            shaders.forEach((s) => gl.attachShader(program, s));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                throw Error("program link");
            gl.useProgram(program);
            buffer = gl.createBuffer();
            if (!buffer)
                throw Error("buffer allocation");
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const a = gl.getAttribLocation(program, "a");
            gl.enableVertexAttribArray(a);
            gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
            for (const n of [
                "uRes",
                "uDpr",
                "uTime",
                "uPill",
                "uRadius",
                "uBlob",
                "uSy",
                "uRip",
                "uMouse",
                "uDark",
                "uAmb",
            ])
                uniforms[n] = gl.getUniformLocation(program, n);
            root.dataset.gl = "on";
        }
        catch {
            releaseGL();
        }
    };
    // Reuse uniform storage; animation frames do not allocate transient typed arrays.
    const blobs = new Float32Array(24), sy = new Float32Array(6).fill(1), ripples = new Float32Array(24);
    const draw = () => {
        if (!gl || gl.isContextLost() || !state.ready || transparency.matches)
            return;
        const dpr = Math.min(devicePixelRatio || 1, 1.5), pad = 14, w = state.width + 28, h = state.height + 28;
        const cw = Math.max(1, Math.round(w * dpr)), ch = Math.max(1, Math.round(h * dpr));
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            gl.viewport(0, 0, cw, ch);
        }
        const distance = Math.abs(state.a - state.b), stretch = Math.min(distance / (state.radius * 2 + state.q * 2), 1);
        blobs.fill(0);
        sy.fill(1);
        ripples.fill(0);
        const cy = pad + state.height / 2;
        const ax = pad + (vertical ? state.cross : state.a), ay = vertical ? pad + state.a : cy;
        const bx = pad + (vertical ? state.cross : state.b), by = vertical ? pad + state.b : cy;
        blobs.set([
            ax,
            ay,
            state.q * (1 - 0.25 * stretch),
            state.radius * (1 - 0.12 * stretch),
            bx,
            by,
            state.q * (1 - 0.8 * stretch),
            vertical ? 0 : state.radius * (1 - 0.5 * stretch),
        ]);
        if (!vertical && distance > state.radius * 1.25) {
            state.split = true;
            blobs.set([
                (ax + bx) / 2,
                (ay + by) / 2 - 3,
                0,
                4.5,
                ax * 0.3 + bx * 0.7,
                ay * 0.3 + by * 0.7 + 4,
                0,
                3,
            ], 8);
        }
        if (state.ripple > 0)
            ripples.set([
                vertical ? pad + state.cross : pad + state.target,
                vertical ? pad + state.target : cy,
                state.ripple,
                0.8,
            ]);
        sy[0] = sy[1] = 1 - 0.14 * Math.min(Math.abs(state.av) / 1000, 1);
        gl.uniform2f(uniforms.uRes, w, h);
        gl.uniform1f(uniforms.uDpr, dpr);
        gl.uniform1f(uniforms.uTime, time);
        gl.uniform4f(uniforms.uPill, pad, pad, state.width, state.height);
        gl.uniform1f(uniforms.uRadius, vertical ? 18 : 999);
        gl.uniform4fv(uniforms.uBlob, blobs);
        gl.uniform1fv(uniforms.uSy, sy);
        gl.uniform4fv(uniforms.uRip, ripples);
        gl.uniform3f(uniforms.uMouse, pad + state.mouseX, pad + state.mouseY, state.hover ? 1 : 0);
        gl.uniform1f(uniforms.uDark, 0);
        gl.uniform1f(uniforms.uAmb, 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const split = String(state.split);
        if (root.dataset.split !== split)
            root.dataset.split = split;
    };
    const moving = () => Math.abs(state.a - state.target) + Math.abs(state.b - state.target) >
        0.2 || Math.abs(state.av) + Math.abs(state.bv) > 2;
    const tick = (now) => {
        frame = 0;
        if (disposed || document.hidden || !visible)
            return;
        // Render each display refresh, not a 30fps gate that skips every other vsync.
        // Bound catch-up after a stalled/background frame; do not fast-forward a spring.
        const dt = previous ? Math.min((now - previous) / 1000, 1 / 24) : 1 / 120;
        previous = now;
        time += dt;
        if (motion.matches || transparency.matches) {
            state.a = state.b = state.target;
            state.av = state.bv = 0;
            state.ripple = 0;
        }
        else if (vertical) {
            // One bounded body for a vertical menu. Retargeting never leaves a satellite behind.
            const before = state.a;
            state.a += (state.target - state.a) * (1 - Math.exp(-dt * 24));
            if (Math.abs(state.target - state.a) < 0.1)
                state.a = state.target;
            state.av = (state.a - before) / dt;
            state.b = state.a;
            state.bv = state.av;
            state.split = false;
            if (state.ripple) {
                state.ripple += dt;
                if (state.ripple > 0.55)
                    state.ripple = 0;
            }
        }
        else {
            // Small bounded steps keep identical damping on 60/100/120/144Hz displays.
            const steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
            for (let i = 0; i < steps; i++) {
                state.av += (210 * (state.target - state.a) - 25 * state.av) * step;
                state.a += state.av * step;
                state.bv += (72 * (state.target - state.b) - 13 * state.bv) * step;
                state.b += state.bv * step;
            }
            if (!moving() && state.split && !state.ripple) {
                state.ripple = 0.001;
                state.split = false;
            }
            if (state.ripple) {
                state.ripple += dt;
                if (state.ripple > 1.7)
                    state.ripple = 0;
            }
        }
        draw();
        if (!motion.matches &&
            !transparency.matches &&
            (moving() || state.ripple))
            frame = requestAnimationFrame(tick);
    };
    const wake = () => {
        if (!frame && !disposed && !document.hidden && visible) {
            previous = 0;
            frame = requestAnimationFrame(tick);
        }
    };
    const select = (index) => {
        if (selected !== index) {
            selected = index;
            state.split = false;
            state.ripple = 0;
            target();
            wake();
        }
    };
    const pointer = (event) => {
        if (!fine.matches || event.pointerType !== "mouse")
            return;
        const r = surfaceRect ?? surface.getBoundingClientRect();
        state.mouseX = event.clientX - r.left;
        state.mouseY = event.clientY - r.top;
        state.hover = true;
        const i = options().findIndex((e) => e.contains(event.target));
        if (i >= 0)
            select(i);
        wake();
    };
    const reset = () => {
        state.hover = false;
        select(activeRef.current);
        wake();
    };
    const focus = (event) => {
        const i = options().findIndex((e) => e.contains(event.target));
        if (i >= 0)
            select(i);
        wake();
    };
    const click = () => {
        if (!motion.matches) {
            state.ripple = 0.001;
            wake();
        }
    };
    const scroll = () => {
        target();
        draw();
        wake();
    };
    surface.addEventListener("scroll", scroll, true);
    const resize = new ResizeObserver(() => {
        target();
        draw();
        wake();
    });
    const intersection = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        visibility();
    });
    const visibility = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        if (!document.hidden && visible)
            wake();
    };
    const preference = () => {
        state.a = state.b = state.target;
        state.av = state.bv = 0;
        state.ripple = 0;
        root.dataset.opaque = String(transparency.matches);
        draw();
        wake();
    };
    const lost = (event) => {
        event.preventDefault();
        cancelAnimationFrame(frame);
        frame = 0;
        releaseGL();
    };
    const restored = () => {
        init();
        target();
        draw();
        wake();
    };
    refresh.current = () => {
        selected = activeRef.current;
        target();
        wake();
    };
    init();
    target();
    preference();
    resize.observe(surface);
    intersection.observe(surface);
    surface.addEventListener("pointermove", pointer, { passive: true });
    surface.addEventListener("pointerleave", reset);
    surface.addEventListener("focusin", focus);
    surface.addEventListener("focusout", reset);
    surface.addEventListener("click", click);
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", preference);
    transparency.addEventListener("change", preference);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
        surface.removeEventListener("scroll", scroll, true);
        disposed = true;
        refresh.current = null;
        cancelAnimationFrame(frame);
        resize.disconnect();
        intersection.disconnect();
        releaseGL();
        surface.removeEventListener("pointermove", pointer);
        surface.removeEventListener("pointerleave", reset);
        surface.removeEventListener("focusin", focus);
        surface.removeEventListener("focusout", reset);
        surface.removeEventListener("click", click);
        document.removeEventListener("visibilitychange", visibility);
        motion.removeEventListener("change", preference);
        transparency.removeEventListener("change", preference);
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
    };
}

const dispose=[mountSmoke(),...Array.from(document.querySelectorAll('.auth-liquid-layer'),el=>mountLiquid(el))];addEventListener('pagehide',()=>dispose.forEach(fn=>fn?.()),{once:true});
})();
