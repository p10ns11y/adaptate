import { coverFit, firePixelRatio, fireTokens, hexColor, objectPosition } from "./hero-fire.ts";

let vertexSource = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

let fragmentSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uImage;
uniform vec4 uFit;
uniform float uTime;
uniform vec3 uPal[8];

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.;
  float a = .5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= .5;
  }
  return v;
}
vec3 ramp(float h) {
  vec3 c = mix(uPal[0], uPal[1], smoothstep(.05, .22, h));
  c = mix(c, uPal[2], smoothstep(.22, .4, h));
  c = mix(c, uPal[3], smoothstep(.4, .56, h));
  c = mix(c, uPal[4], smoothstep(.56, .74, h));
  return mix(c, uPal[5], smoothstep(.74, .95, h));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uFit.xy) / uFit.zw;
  uv.y = 1. - uv.y;
  vec2 q = vec2((uv.x - .742) * 1.7778, uv.y - .542);
  float t = uTime;
  float d = max(q.y, 0.);
  float below = smoothstep(-.004, .025, q.y);

  float hot = below * exp(-abs(q.x) * 9.) * smoothstep(.0, .08, d);
  vec2 warp = vec2(noise(vec2(q.x * 42., q.y * 30. - t * 7.)), noise(vec2(q.x * 36. + 7., q.y * 26. - t * 6.))) - .5;
  float zone = smoothstep(.52, .86, uv.y) * smoothstep(.3, .56, uv.x);
  float billow = fbm(uv * vec2(5., 4.) + vec2(t * .05, -t * .08));
  vec2 suv = uv + warp * .007 * hot + (billow - .5) * .014 * zone;
  vec3 col = texture2D(uImage, clamp(suv, 0., 1.)).rgb;

  float puff = smoothstep(.42, .8, fbm(uv * vec2(3.5, 3.) + vec2(-t * .03, t * .06) + billow));
  col = mix(col, uPal[7] * .85, puff * zone * .22);

  float n = fbm(vec2(q.x * 14., d * 7. - t * 3.2));
  float m = fbm(vec2(q.x * 30. + 3., d * 16. - t * 6.5));
  float w = .007 + .06 * d + .02 * d * n;
  float x = q.x + (n - .5) * .05 * d;
  float body = exp(-x * x / (w * w)) * below * (1. - smoothstep(.12, .34 + .14 * n, d));
  float core = exp(-x * x / (w * w * .1)) * below * exp(-d * 5.);
  float heat = clamp(body * (.45 + .75 * m) * (1. - d * 1.2) + core * .7, 0., 1.);
  float blue = exp(-x * x / .00005) * exp(-d * 45.) * smoothstep(-.012, .0, q.y);
  vec3 flame = mix(ramp(heat), uPal[6], blue * .75);
  float alpha = clamp(body * 1.25 + blue, 0., 1.);
  col = mix(col, flame, alpha * .9);

  float flicker = .85 + .15 * sin(t * 13. + n * 6.);
  col += uPal[1] * exp(-abs(q.x) * 5.) * smoothstep(.0, .25, d) * flicker * .09;
  gl_FragColor = vec4(col, 1.);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  let shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function link(gl: WebGLRenderingContext): WebGLProgram | null {
  let vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  let fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  let program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function palette(): number[] | null {
  let style = getComputedStyle(document.documentElement);
  let colors = fireTokens.map((token) => hexColor(style.getPropertyValue(token)));
  return colors.every((color) => color) ? colors.flatMap((color) => color ?? []) : null;
}

export async function lightFire(art: HTMLElement): Promise<void> {
  let image = art.querySelector("img");
  let colors = palette();
  if (!image || !colors) return;
  try {
    await image.decode();
  } catch {
    return;
  }
  let canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  let gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true });
  let program = gl && link(gl);
  if (!gl || !program) return;

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  let position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (let [name, value] of [
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
  ] as const) {
    gl.texParameteri(gl.TEXTURE_2D, name, value);
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.uniform3fv(gl.getUniformLocation(program, "uPal"), colors);
  let fitLocation = gl.getUniformLocation(program, "uFit");
  let timeLocation = gl.getUniformLocation(program, "uTime");
  if (gl.getError() !== gl.NO_ERROR) return;

  art.append(canvas);
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let begin = performance.now();
  let frame = 0;
  let visible = true;
  let lost = false;

  let size = () => {
    let box = canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    let ratio = firePixelRatio(window.devicePixelRatio, box.width, box.height);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    let fit = coverFit(box.width, box.height, objectPosition(getComputedStyle(image).objectPosition));
    let scale = canvas.width / box.width;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform4f(fitLocation, fit.x * scale, (box.height - fit.y - fit.height) * scale, fit.width * scale, fit.height * scale);
  };
  let draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    gl.uniform1f(timeLocation, ((now - begin) / 1000) % 600);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (art.dataset.fire === undefined) art.dataset.fire = "";
  };
  let sync = () => {
    if (lost || reduced.matches) delete art.dataset.fire;
    let run = visible && !lost && !reduced.matches && !document.hidden;
    if (run && !frame) frame = requestAnimationFrame(draw);
    if (!run && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  canvas.addEventListener("webglcontextlost", () => {
    lost = true;
    sync();
  });
  new ResizeObserver(size).observe(art);
  new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    sync();
  }).observe(art);
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
  size();
  sync();
}
