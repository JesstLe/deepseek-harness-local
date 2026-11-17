import {liquidFragmentShader,liquidVertexShader} from './liquid-shader.js';
export function mountLiquid(layerElement, optionSelector = '.auth-option', vertical = false) {
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
