/** Smoke Login shader, Aakash Mehra, MIT. See docs/implementation/SMOKE_LOGIN.md.
 * Adapted from the public 21st.dev live demo; renderer is local and dependency-free.
 */
export const smokeVertexShader = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
export const smokeFragmentShader = `
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
