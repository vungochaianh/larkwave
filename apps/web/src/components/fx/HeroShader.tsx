"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FX_BRAND_RGB, readFxTheme, watchFxTheme } from "./fxTheme";
import { FxStyles } from "./FxStyles";
import Starfield from "./Starfield";
import { useFinePointer, useReducedMotion } from "./useFxPrefs";

/**
 * Nền hero bằng WebGL THẬT — một fragment shader toàn màn, không three.js (app SSR bằng Next; một
 * thư viện 3D chỉ để vẽ nền là phình bundle vô ích). Shader dựng ba thứ CSS không bao giờ làm được:
 *
 *  - Sàn lưới có phối cảnh và SƯƠNG MÙ theo khoảng cách (raymarch mặt phẳng): đường gần rõ, xa mờ
 *    dần rồi tan vào chân trời — đó là chiều sâu thật, không phải lưới xoay rotateX.
 *  - Tinh vân thể tích (fbm) trôi rất chậm phía chân trời — chuyển động điện ảnh, không nhấp nháy.
 *  - Trường hạt ba lớp: hạt gần to hơn, dịch nhiều hơn theo chuột; hạt xa gần như đứng yên.
 *
 * Chuột lắc camera (yaw/pitch nhỏ, làm mượt bằng lerp chậm) và cuộn hạ camera xuống sát sàn —
 * nên rê chuột hay cuộn đều thấy KHÔNG GIAN đổi góc nhìn, không phải một ảnh trượt.
 *
 * An toàn: chỉ chạy sau mount (server render một <canvas> rỗng); không có WebGL / thiếu
 * derivatives / lỗi biên dịch / mất context → rơi về Starfield (Canvas 2D), không bao giờ trắng
 * trang. Dừng hẳn khi tab ẩn hoặc khối ra khỏi khung nhìn. DPR trần 1.5 và trần diện tích 1.6M
 * pixel: nền mềm thì phóng lên một chút không ai thấy, còn màn 4K chạy full-res thì máy yếu nóng.
 * Giảm chuyển động: vẽ đúng MỘT khung tĩnh.
 */

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

// Shader viết cho WebGL1 + OES_standard_derivatives (fwidth cho anti-alias đường lưới). highp khi
// có: lưới ở xa tính fract() trên số lớn, mediump sẽ lộ răng cưa nhấp nháy.
const FRAG = `
#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;   /* -1..1, đã làm mượt */
uniform float u_scroll; /* 0..1: khối đã cuộn qua bao nhiêu */
uniform float u_dark;   /* 1 nền tối (cộng sáng), 0 nền sáng (mực) */
uniform vec3 u_accent;
uniform vec3 u_ink;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm(vec2 p){
  float v=0.,a=.5;
  for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(17.,9.);a*=.5;}
  return v;
}
/* Một lớp hạt ở độ sâu z (0 gần → 1 xa): ô lưới nhỏ hơn, hạt nhỏ hơn, dịch theo chuột ít hơn. */
float dots(vec2 uv,float z,float t){
  vec2 p=uv*(9.+z*9.)+vec2(t*.012*(1.2-z),t*.006)+u_mouse*vec2(.09,-.09)*(1.15-z);
  vec2 i=floor(p),f=fract(p);
  float h=hash(i);
  vec2 c=vec2(.3+.4*hash(i+3.1),.3+.4*hash(i+7.7));
  float d=length(f-c);
  float tw=.65+.35*sin(t*(.5+h)+h*6.2831);
  float r=.02+.035*h*(1.-z);
  return (1.-smoothstep(0.,r,d))*tw*step(.74,h);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*u_res)/u_res.y;
  float t=u_time;
  /* Camera: cao 1.1 trên sàn, ngước nhẹ; cuộn thì hạ xuống và cúi theo → sàn "dâng lên". */
  float yaw=u_mouse.x*.10;
  float pitch=-.10+u_mouse.y*.05-u_scroll*.22;
  vec3 ro=vec3(u_mouse.x*.7,1.1-u_scroll*.75,0.);
  vec3 rd=normalize(vec3(uv.x,uv.y,1.45));
  float cp=cos(pitch),sp=sin(pitch);rd.yz=mat2(cp,-sp,sp,cp)*rd.yz;
  float cy=cos(yaw),sy=sin(yaw);rd.xz=mat2(cy,-sy,sy,cy)*rd.xz;

  /* 1) Sàn lưới y = -1, sương mù theo khoảng cách. */
  /* Không rẽ nhánh theo rd.y: fwidth() trong luồng điều khiển không đồng nhất là hành vi không
     xác định theo spec. Tia hướng lên được kẹp về một khoảng cách rất xa → sương mù đưa về 0. */
  float dist=(-1.-ro.y)/min(rd.y,-.002);
  vec3 p=ro+rd*dist;
  p.z+=t*.55;
  vec2 g=abs(fract(p.xz)-.5);
  vec2 fw=fwidth(p.xz)*1.15+.01;
  vec2 l=1.-smoothstep(vec2(0.),fw,g);
  float fine=max(l.x,l.y);
  vec2 g5=abs(fract(p.xz/5.)-.5);
  vec2 l5=1.-smoothstep(vec2(0.),fw/5.+.004,g5);
  float coarse=max(l5.x,l5.y);
  float fog=exp(-dist*.14)*step(rd.y,-.002);
  /* Quầng đèn dưới sàn, hơi lệch về phía trước — điểm sáng để mắt bám vào giữa hero. */
  float pool=exp(-length(p.xz-vec2(0.,7.+t*.55))*.10)*.35;
  float grid=(fine*.5+coarse*.9+pool)*fog;
  /* 2) Chân trời: một vệt sáng mảnh đúng nơi rd.y = 0. */
  float hz=exp(-abs(rd.y+.005)*42.)*.85;
  /* 3) Tinh vân phía trên chân trời, trôi rất chậm. */
  float neb=0.;
  if(rd.y>-.08){
    vec2 sp=vec2(rd.x/(rd.y+.32),1./(rd.y+.32));
    neb=fbm(sp*vec2(.35,.22)+vec2(t*.010,-t*.006)+u_mouse*.02);
    neb=smoothstep(.36,.9,neb)*exp(-rd.y*3.2)*.6;
  }
  /* 4) Hạt ba lớp. */
  float st=dots(uv,0.,t)*1.+dots(uv,.5,t)*.7+dots(uv,1.,t)*.45;

  vec3 blue=vec3(.31,.71,1.);
  vec3 pink=vec3(1.,.48,.71);
  float vig=1.-smoothstep(.3,1.25,length(uv*vec2(.75,1.)));

  if(u_dark>.5){
    vec3 col=vec3(0.);
    col+=u_accent*grid*1.5;
    col+=mix(u_accent,pink,.35)*hz;
    col+=mix(u_accent*.75,blue*.55,clamp(uv.x+.5,0.,1.))*neb;
    col+=vec3(.86,.85,1.)*st;
    col*=vig;
    float a=clamp(max(max(col.r,col.g),col.b),0.,1.);
    gl_FragColor=vec4(col,a); /* premultiplied */
  }else{
    /* Nền sáng: cùng hình học nhưng in bằng "mực" mờ, để không thành đèn neon trên giấy trắng. */
    float ink=clamp(grid*.9+hz*.5+st*.7+neb*.35,0.,1.)*.42*vig;
    vec3 c=mix(u_ink,u_accent,.6);
    gl_FragColor=vec4(c*ink,ink);
  }
}
`;

type Fade = "none" | "radial" | "bottom";

export default function HeroShader({
  fade = "bottom",
  className,
  style,
}: {
  /** Mờ dần ở mép: `bottom` (mặc định, hero tan xuống khối kế tiếp), `radial`, hay `none`. */
  fade?: Fade;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const finePointer = useFinePointer();
  const [fallback, setFallback] = useState(false);
  // Cờ chuột qua ref chứ không qua deps của effect: hook flip false→true ngay sau mount, mà mỗi lần
  // effect chạy lại là một WebGL context mới — tạo rồi huỷ context hai lần chỉ để đổi một cờ.
  const fineRef = useRef(false);
  fineRef.current = finePointer && !reduced;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || fallback) return;

    // ---- Khởi tạo: bất kỳ bước nào hỏng → fallback, không ném lỗi ra ngoài -------------------
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      }) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
    if (!gl || !gl.getExtension("OES_standard_derivatives")) {
      setFallback(true);
      return;
    }
    const G = gl;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = G.createShader(type);
      if (!sh) return null;
      G.shaderSource(sh, src);
      G.compileShader(sh);
      if (!G.getShaderParameter(sh, G.COMPILE_STATUS)) {
        // Log để còn biết vì sao máy này rơi về Canvas 2D; người dùng thì không thấy gì khác lạ.
        console.warn("[fx] HeroShader compile:", G.getShaderInfoLog(sh));
        G.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(G.VERTEX_SHADER, VERT);
    const fs = compile(G.FRAGMENT_SHADER, FRAG);
    const prog = G.createProgram();
    if (!vs || !fs || !prog) {
      setFallback(true);
      return;
    }
    G.attachShader(prog, vs);
    G.attachShader(prog, fs);
    G.linkProgram(prog);
    if (!G.getProgramParameter(prog, G.LINK_STATUS)) {
      console.warn("[fx] HeroShader link:", G.getProgramInfoLog(prog));
      setFallback(true);
      return;
    }
    G.useProgram(prog);
    // Một tam giác phủ cả màn (rẻ hơn hai tam giác: không có đường chéo bị rasterize hai lần).
    const buf = G.createBuffer();
    G.bindBuffer(G.ARRAY_BUFFER, buf);
    G.bufferData(G.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), G.STATIC_DRAW);
    const aLoc = G.getAttribLocation(prog, "a");
    G.enableVertexAttribArray(aLoc);
    G.vertexAttribPointer(aLoc, 2, G.FLOAT, false, 0, 0);
    const u = {
      res: G.getUniformLocation(prog, "u_res"),
      time: G.getUniformLocation(prog, "u_time"),
      mouse: G.getUniformLocation(prog, "u_mouse"),
      scroll: G.getUniformLocation(prog, "u_scroll"),
      dark: G.getUniformLocation(prog, "u_dark"),
      accent: G.getUniformLocation(prog, "u_accent"),
      ink: G.getUniformLocation(prog, "u_ink"),
    };
    const accent = FX_BRAND_RGB[0];
    G.uniform3f(u.accent, accent[0] / 255, accent[1] / 255, accent[2] / 255);

    // ---- Trạng thái vòng vẽ -------------------------------------------------------------------
    let raf = 0;
    let visible = true;
    let lost = false;
    let start = 0;
    let mxT = 0;
    let myT = 0;
    let mx = 0;
    let my = 0;
    let w = 1;
    let h = 1;

    const applyTheme = () => {
      const th = readFxTheme(canvas);
      G.uniform1f(u.dark, th.dark ? 1 : 0);
      G.uniform3f(u.ink, th.ink[0] / 255, th.ink[1] / 255, th.ink[2] / 255);
    };

    const draw = (now: number) => {
      if (lost) return;
      if (!start) start = now;
      // Chu kỳ 600s để u_time không lớn tới mức float mất độ chính xác sau vài giờ mở tab.
      const t = reduced ? 0 : ((now - start) / 1000) % 600;
      // Lerp chậm (0.05): chuột giật thì camera vẫn lướt như steadicam — "điện ảnh" là ở đây.
      mx += (mxT - mx) * 0.05;
      my += (myT - my) * 0.05;
      const r = canvas.getBoundingClientRect();
      const scroll = r.height > 0 ? Math.max(0, Math.min(1, -r.top / r.height)) : 0;
      G.uniform2f(u.res, canvas.width, canvas.height);
      G.uniform1f(u.time, t);
      G.uniform2f(u.mouse, mx, my);
      G.uniform1f(u.scroll, scroll);
      G.drawArrays(G.TRIANGLES, 0, 3);
    };
    const loop = (now: number) => {
      raf = 0;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (reduced || raf || !visible || lost || document.hidden) return;
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const drawOnce = () => {
      if (lost) return;
      draw(performance.now());
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      let dpr = Math.min(1.5, window.devicePixelRatio || 1);
      // Trần diện tích: màn 4K × DPR 1.5 = 12M pixel × 4 octave noise mỗi khung là quá sức máy văn phòng.
      const cap = 1.6e6;
      const area = w * h * dpr * dpr;
      if (area > cap) dpr *= Math.sqrt(cap / area);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      G.viewport(0, 0, canvas.width, canvas.height);
      drawOnce();
    };

    const onMove = (e: PointerEvent) => {
      if (!fineRef.current) return;
      if (e.pointerType && e.pointerType !== "mouse") return;
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      mxT = (e.clientX / vw) * 2 - 1;
      myT = -((e.clientY / vh) * 2 - 1);
    };
    const onVisibility = () => (document.hidden ? stopLoop() : startLoop());
    // Mất context (GPU reset, quá nhiều canvas): không thử khôi phục — rơi về Canvas 2D cho chắc.
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      stopLoop();
      setFallback(true);
    };

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((en) => en.isIntersecting);
      if (visible) startLoop();
      else stopLoop();
    });
    const ro = new ResizeObserver(resize);
    const unwatchTheme = watchFxTheme(() => {
      applyTheme();
      drawOnce();
    });

    applyTheme();
    resize();
    io.observe(canvas);
    ro.observe(canvas);
    canvas.addEventListener("webglcontextlost", onLost);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onMove, { passive: true });
    // Giảm chuyển động: cuộn vẫn đổi góc camera (đó là phản hồi trực tiếp với thao tác, không phải
    // chuyển động tự phát) — vẽ lại một khung mỗi lần cuộn thay vì chạy vòng lặp.
    const onScrollStatic = () => {
      if (reduced && visible) drawOnce();
    };
    if (reduced) window.addEventListener("scroll", onScrollStatic, { passive: true });
    startLoop();

    return () => {
      stopLoop();
      io.disconnect();
      ro.disconnect();
      unwatchTheme();
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScrollStatic);
      G.deleteBuffer(buf);
      G.deleteProgram(prog);
      G.deleteShader(vs);
      G.deleteShader(fs);
      // Trả GPU context ngay khi rời trang: trình duyệt giới hạn số context sống, điều hướng qua
      // lại vài trang hero mà không trả là trang sau bị từ chối WebGL.
      G.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [reduced, fallback]);

  const cls = [
    "tw-fx-canvas",
    fade === "radial" ? "tw-fx-fade" : fade === "bottom" ? "tw-fx-fade-b" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (fallback) return <Starfield variant="grid" fade={fade !== "none"} className={className} style={style} />;
  return (
    <>
      <FxStyles />
      <canvas ref={ref} className={cls} style={style} aria-hidden="true" />
    </>
  );
}
