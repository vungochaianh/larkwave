import type { TtsAlignment } from './tts.service';
import type { Palette } from '../media/palettes';

export interface Cue {
  text: string;
  start: number;
  end: number;
}

/**
 * Split narration into caption chunks WITH their character offsets in `text` (so we can look up
 * each chunk's spoken start/end time from the ElevenLabs alignment).
 */
function splitChunks(text: string): { text: string; startIdx: number; endIdx: number }[] {
  const out: { text: string; startIdx: number; endIdx: number }[] = [];
  const isEnder = (c: string) => c === '.' || c === '!' || c === '?' || c === '…' || c === '\n';
  const push = (s: number, e: number) => {
    let a = s;
    let b = e;
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b > a) out.push({ text: text.slice(a, b), startIdx: a, endIdx: b - 1 });
  };
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (isEnder(text[i])) {
      push(start, i + 1);
      start = i + 1;
    }
  }
  if (start < text.length) push(start, text.length);
  return out;
}

/** Build timed caption cues from the narration + ElevenLabs per-character alignment. */
export function buildCues(text: string, alignment: TtsAlignment | null, durationSec: number): Cue[] {
  const chunks = splitChunks(text);
  if (!chunks.length) return [{ text: text.slice(0, 120) || 'Larkwave', start: 0, end: durationSec }];
  if (alignment && alignment.starts.length) {
    const { starts, ends } = alignment;
    const n = starts.length;
    const cues: Cue[] = chunks.map((c) => {
      const si = Math.min(Math.max(c.startIdx, 0), n - 1);
      const ei = Math.min(Math.max(c.endIdx, 0), ends.length - 1);
      return { text: c.text, start: starts[si] ?? 0, end: ends[ei] ?? durationSec };
    });
    // Make each cue span until the NEXT cue begins (so a caption stays up through any gap/pause).
    for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.max(cues[i].end, cues[i + 1].start);
    cues[cues.length - 1].end = Math.max(cues[cues.length - 1].end, durationSec);
    return cues;
  }
  // No timestamps → distribute evenly across the duration.
  const seg = durationSec / chunks.length;
  return chunks.map((c, i) => ({ text: c.text, start: i * seg, end: (i + 1) * seg }));
}

/**
 * DETERMINISTIC seekable scene — the PRIMARY video renderer. Renders exactly ONE caption at a time
 * (never overlaps), each shown for its real spoken window (from `cues`), over a template-styled
 * background. Exposes `window.TW = { duration, fps, seek(t) }` (pure function of t).
 */
export function buildScene(opts: {
  cues: Cue[];
  durationSec: number;
  template: string; // draw | pixel | game — the illustration ENGINE (colours come from `pal`)
  w: number;
  h: number;
  pal: Palette;
  variant: number;
  character: string; // none | stick | round | box — the mascot to draw (none = generic icons)
}): string {
  const { cues, durationSec, template, w, h, pal, variant, character } = opts;
  // Colours are fully driven by the chosen palette (template only selects the drawing engine).
  const p = { bg: pal.bg, bg2: pal.bg2, ink: pal.ink, accent: pal.accent, colors: pal.colors, dark: pal.dark };
  const safeCues = (cues.length ? cues : [{ text: 'Larkwave', start: 0, end: durationSec }]).map((c) => ({
    text: c.text.replace(/\s+/g, ' ').trim().slice(0, 220),
    start: Math.max(0, c.start),
    end: Math.max(c.start + 0.1, c.end),
  }));
  const cfg = JSON.stringify({ W: w, H: h, DUR: durationSec, CUES: safeCues, P: p, TPL: template, VAR: variant, CHAR: character || 'none' });

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${p.bg};overflow:hidden}
    canvas{display:block}
  </style></head><body>
  <canvas id="c" width="${w}" height="${h}"></canvas>
  <script>
  (function(){
    var CFG = ${cfg};
    var W=CFG.W, H=CFG.H, DUR=CFG.DUR, CUES=CFG.CUES, P=CFG.P, TPL=CFG.TPL, VAR=CFG.VAR||0, CHAR=CFG.CHAR||'none', FPS=30;
    var ctx=document.getElementById('c').getContext('2d');
    var baseFont = TPL==='pixel' ? "'Courier New',monospace" : "'Segoe UI',Roboto,Arial,sans-serif";
    // Composition anchor for the main subject — varies per project so layouts differ.
    var ANCHORS=[[0.5,0.33],[0.38,0.34],[0.62,0.33],[0.5,0.40],[0.5,0.29]];
    var AN=ANCHORS[((VAR%ANCHORS.length)+ANCHORS.length)%ANCHORS.length];
    var ACX=W*AN[0], ACY=H*AN[1];
    function clamp(v,a,b){return v<a?a:v>b?b:v;}
    function hexA(hex,a){var h=hex.replace('#','');if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return 'rgba('+parseInt(h.substr(0,2),16)+','+parseInt(h.substr(2,2),16)+','+parseInt(h.substr(4,2),16)+','+a+')';}
    function toRGB(hex){var h=(hex||'#000').replace('#','');if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.substr(0,2),16)||0,parseInt(h.substr(2,2),16)||0,parseInt(h.substr(4,2),16)||0];}
    function lumRGB(c){return 0.299*c[0]+0.587*c[1]+0.114*c[2];}
    var BGL=lumRGB(toRGB(P.bg));
    // Stroke colour with GUARANTEED contrast vs the background (so no palette washes out on white/dark).
    function sc(hex){var c=toRGB(hex),g=0;
      if(P.dark){ while(lumRGB(c)-BGL<70 && g<8){c=[Math.min(255,c[0]+30),Math.min(255,c[1]+30),Math.min(255,c[2]+30)];g++;} }
      else { while(BGL-lumRGB(c)<95 && g<8){c=[Math.round(c[0]*0.8),Math.round(c[1]*0.8),Math.round(c[2]*0.8)];g++;} }
      return 'rgb('+c[0]+','+c[1]+','+c[2]+')';}
    function wrap(text,maxW,font){ctx.font=font;var words=text.split(' '),lines=[],cur='';
      for(var i=0;i<words.length;i++){var t=cur?cur+' '+words[i]:words[i];
        if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=words[i];}else cur=t;}
      if(cur)lines.push(cur);return lines;}
    function bg(t){
      // gradient direction varies by composition variant
      var gd=[[0,0,W,H],[W,0,0,H],[0,0,0,H],[0,H,W,0],[W*0.5,0,W*0.5,H]][VAR%5];
      var g=ctx.createLinearGradient(gd[0],gd[1],gd[2],gd[3]);g.addColorStop(0,P.bg);g.addColorStop(1,P.bg2);
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      var cx=ACX+W*0.12*Math.sin(t*0.5),cy=ACY+H*0.04*Math.cos(t*0.45);
      var rg=ctx.createRadialGradient(cx,cy,0,cx,cy,W*0.7);
      rg.addColorStop(0,hexA(P.accent,P.dark?0.30:0.18));rg.addColorStop(1,hexA(P.accent,0));
      ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);
    }
    // ── animated illustration (per template) — keeps every frame alive even without MAIC art ──
    // WHITEBOARD draw-on: pen strokes appear progressively (like a hand sketching) with a marker tip.
    function arcPts(cx,cy,r,a0,a1,n){var a=[];for(var i=0;i<=n;i++){var an=a0+(a1-a0)*(i/n);a.push([cx+Math.cos(an)*r,cy+Math.sin(an)*r]);}return a;}
    function circlePts(cx,cy,r,n){return arcPts(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2,n||44);}
    function linePts(x1,y1,x2,y2,n){var a=[];n=n||10;for(var i=0;i<=n;i++){a.push([x1+(x2-x1)*(i/n),y1+(y2-y1)*(i/n)]);}return a;}
    function star4(cx,cy,r){ return [linePts(cx-r,cy,cx+r,cy,3),linePts(cx,cy-r,cx,cy+r,3),linePts(cx-r*0.7,cy-r*0.7,cx+r*0.7,cy+r*0.7,3),linePts(cx-r*0.7,cy+r*0.7,cx+r*0.7,cy-r*0.7,3)]; }
    // Hand-drawn decorations around the main subject so the frame reads as a full sketch, not a lone icon.
    function decorStrokes(){
      var d=[];
      d=d.concat(star4(W*0.20,H*0.16,W*0.032), star4(W*0.83,H*0.19,W*0.038), star4(W*0.15,H*0.50,W*0.026), star4(W*0.86,H*0.50,W*0.03));
      d.push(circlePts(W*0.30,H*0.53,W*0.02,12), circlePts(W*0.72,H*0.13,W*0.017,12), circlePts(W*0.24,H*0.24,W*0.014,10));
      d.push(linePts(ACX-W*0.20,ACY+H*0.20,ACX+W*0.20,ACY+H*0.20,10)); // baseline under the subject
      d.push(arcPts(ACX,ACY+H*0.24,W*0.26,0.08*Math.PI,0.42*Math.PI,14)); // little flourish
      return d;
    }
    function iconStrokes(idx){
      var cx=ACX, cy=ACY, r=W*0.20;
      switch(((idx%5)+5)%5){
        case 0: // smiley
          return [circlePts(cx,cy,r,46), arcPts(cx,cy+r*0.1,r*0.5,0.18*Math.PI,0.82*Math.PI,18),
            circlePts(cx-r*0.36,cy-r*0.12,r*0.07,10), circlePts(cx+r*0.36,cy-r*0.12,r*0.07,10)];
        case 1: // lightbulb (idea)
          return [circlePts(cx,cy-r*0.15,r*0.62,40), linePts(cx-r*0.28,cy+r*0.5,cx+r*0.28,cy+r*0.5,6),
            linePts(cx-r*0.22,cy+r*0.68,cx+r*0.22,cy+r*0.68,6)];
        case 2: // check
          return [ [[cx-r*0.5,cy],[cx-r*0.12,cy+r*0.42],[cx+r*0.6,cy-r*0.5]] ];
        case 3: { // star
          var s=[];for(var i=0;i<=10;i++){var an=-Math.PI/2+i*Math.PI/5;var rr=(i%2===0)?r:r*0.45;s.push([cx+Math.cos(an)*rr,cy+Math.sin(an)*rr]);}return [s]; }
        default: // upward arrow (growth)
          return [linePts(cx-r*0.6,cy+r*0.6,cx+r*0.6,cy-r*0.6,12), [[cx+r*0.2,cy-r*0.6],[cx+r*0.6,cy-r*0.6],[cx+r*0.6,cy-r*0.2]] ];
      }
    }
    var PAL=(P.colors&&P.colors.length)?P.colors:['#6C5CE7','#4fd1c5','#ff6b9d','#ffd93d'];
    function drawSketch(t){
      var cue=curCue(t); var idx0=CUES.indexOf(cue); if(idx0<0)idx0=0;
      var idx=idx0+VAR; // variant shifts which icon/colour a beat starts on → different look per project
      var dur=Math.max(0.6,cue.end-cue.start), local=clamp((t-cue.start)/dur,0,1);
      var prog=clamp(local/0.4,0,1); // draw FAST — finished in the first ~40% of the cue, then hold
      var mainColor=PAL[((idx%PAL.length)+PAL.length)%PAL.length];
      var cx=ACX, cy=ACY, r=W*0.20;
      // soft colour fill behind the subject — it "colours in" as the drawing appears
      ctx.globalAlpha=(P.dark?0.22:0.15)*prog; ctx.fillStyle=mainColor;
      ctx.beginPath(); ctx.arc(cx,cy,r*1.08,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
      var main=iconStrokes(idx), decor=decorStrokes();
      var total=0, si; for(si=0;si<main.length;si++)total+=main[si].length; for(si=0;si<decor.length;si++)total+=decor[si].length;
      var reveal=Math.max(1,Math.floor(prog*total)), count=0;
      ctx.lineCap='round';ctx.lineJoin='round';
      // main subject in its bright colour (contrast-clamped so it never washes out on the bg)
      ctx.strokeStyle=sc(mainColor); ctx.lineWidth=Math.max(6,W*0.013);
      for(si=0;si<main.length;si++){var s=main[si];ctx.beginPath();
        for(var i=0;i<s.length;i++){ if(count>=reveal)break; if(i===0)ctx.moveTo(s[i][0],s[i][1]);else ctx.lineTo(s[i][0],s[i][1]); count++; }
        ctx.stroke(); if(count>=reveal)break; }
      // decorations — each stroke a different palette colour
      if(count<reveal){ ctx.lineWidth=Math.max(3,W*0.008);
        for(si=0;si<decor.length;si++){var d=decor[si]; ctx.strokeStyle=sc(PAL[(si+idx+1)%PAL.length]); ctx.beginPath();
          for(var j=0;j<d.length;j++){ if(count>=reveal)break; if(j===0)ctx.moveTo(d[j][0],d[j][1]);else ctx.lineTo(d[j][0],d[j][1]); count++; }
          ctx.stroke(); if(count>=reveal)break; } }
    }
    function pc(i){ return PAL[((i%PAL.length)+PAL.length)%PAL.length]; }
    function drawDoodles(t){
      for(var i=0;i<8;i++){var ph=i*1.7;
        var x=W*(0.1+0.8*(((i*0.137)+t*0.018)%1));
        var y=H*(0.12+0.44*(0.5+0.5*Math.sin(t*0.7+ph)));
        var s=W*0.009*(1+0.5*Math.sin(t*1.3+ph));
        ctx.globalAlpha=0.45;ctx.fillStyle=(i%2)?P.accent:pc(i+VAR);
        ctx.beginPath();ctx.arc(x,y,s,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    }
    function drawPixel(t){
      var g=W/40; // pixel size
      ctx.imageSmoothingEnabled=false;
      // blinking stars
      for(var i=0;i<14;i++){var ph=i*2.1;var x=Math.round((W*((i*0.0731)%1))/g)*g;var y=Math.round((H*(0.1+0.4*((i*0.211)%1)))/g)*g;
        if(Math.sin(t*3+ph)>0){ctx.fillStyle=i%3?P.accent:pc(i+VAR+1);ctx.fillRect(x,y,g,g);}}
      // hero sprite (chunky) bobbing — placed at the composition anchor
      var bx=Math.round((ACX-g*2)/g)*g, by=Math.round((ACY-g*2+Math.abs(Math.sin(t*3))*H*0.03)/g)*g;
      ctx.fillStyle=P.accent;ctx.fillRect(bx,by,g*4,g*4);
      ctx.fillStyle=P.dark?'#fff':'#111';ctx.fillRect(bx+g,by+g,g,g);ctx.fillRect(bx+g*2,by+g,g,g);
      ctx.fillStyle=pc(VAR+2);ctx.fillRect(bx+g,by+g*3,g*2,g);
      // scrolling ground
      ctx.fillStyle=hexA(P.accent,0.5);var off=Math.round((t*g*4)%(g*2)/g)*g;
      for(var x2=-g*2+off;x2<W;x2+=g*2){ctx.fillRect(x2,H*0.5,g,g);}
    }
    function drawGame(t){
      for(var i=0;i<6;i++){var ph=i*1.3, depth=0.4+0.6*(i/6);
        var x=(W*((i*0.17+t*0.03*depth)%1)), y=H*(0.12+0.4*(0.5+0.5*Math.sin(t*0.6*depth+ph)));
        var rr=W*0.05*depth;
        var rg=ctx.createRadialGradient(x,y,0,x,y,rr);
        rg.addColorStop(0,hexA(i%2?P.accent:pc(i+VAR),0.7));rg.addColorStop(1,hexA(P.accent,0));
        ctx.fillStyle=rg;ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);ctx.fill();}
      // pulsing hero at the composition anchor
      var pr=W*0.09*(1+0.12*Math.sin(t*4));
      ctx.save();ctx.translate(ACX,ACY);ctx.rotate(Math.sin(t*0.8)*0.15);
      ctx.fillStyle=hexA(pc(VAR),0.92);ctx.beginPath();ctx.moveTo(0,-pr);ctx.lineTo(pr*0.9,pr*0.7);ctx.lineTo(-pr*0.9,pr*0.7);ctx.closePath();ctx.fill();
      ctx.restore();
    }
    // ── MASCOT character (Sticky=stick / Bloop=round / Robo=box) — per-beat pose + expression ──
    var POSES=[
      {h:[[-0.95,-0.35],[0.85,0.35]], f:[[0.55,1.75],[-0.55,1.95]], lift:0},    // run
      {h:[[-0.95,-1.7],[0.95,-1.7]],  f:[[-0.4,1.35],[0.4,1.35]],   lift:-0.45}, // jump
      {h:[[-0.7,-1.15],[0.7,-1.15]],  f:[[-0.55,1.8],[0.55,1.8]],   lift:0},     // flex
      {h:[[-0.85,-1.9],[0.85,-1.9]],  f:[[-0.35,1.8],[0.35,1.8]],   lift:0},     // cheer
      {h:[[-1.05,-0.2],[1.05,-0.2]],  f:[[-0.7,1.5],[0.7,1.5]],     lift:0.18},  // land
      {h:[[-0.5,0.25],[0.6,-0.35]],   f:[[-0.32,1.85],[0.32,1.85]], lift:0}      // thumbs-up
    ];
    var EXPRS=['hyped','determined','shocked','laughing','smirking','happy'];
    function drawFace(hx,hy,hr,expr,LINE){
      ctx.lineCap='round';ctx.lineJoin='round';
      var ex=hr*0.36, ey=-hr*0.12, er=hr*0.13;
      if(expr==='shocked')er=hr*0.17;
      ctx.fillStyle=LINE;ctx.strokeStyle=LINE;
      if(expr==='laughing'){ ctx.lineWidth=Math.max(3,hr*0.09);
        ctx.beginPath();ctx.arc(hx-ex,hy+ey+er*0.4,er,Math.PI*1.15,Math.PI*1.85);ctx.stroke();
        ctx.beginPath();ctx.arc(hx+ex,hy+ey+er*0.4,er,Math.PI*1.15,Math.PI*1.85);ctx.stroke();
      } else { ctx.beginPath();ctx.arc(hx-ex,hy+ey,er,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(hx+ex,hy+ey,er,0,Math.PI*2);ctx.fill(); }
      if(expr==='determined'){ ctx.lineWidth=Math.max(3,hr*0.08);
        ctx.beginPath();ctx.moveTo(hx-ex*1.5,hy+ey-er*1.3);ctx.lineTo(hx-ex*0.4,hy+ey-er*0.4);ctx.stroke();
        ctx.beginPath();ctx.moveTo(hx+ex*1.5,hy+ey-er*1.3);ctx.lineTo(hx+ex*0.4,hy+ey-er*0.4);ctx.stroke(); }
      var my=hy+hr*0.34; ctx.lineWidth=Math.max(3,hr*0.09); ctx.strokeStyle=LINE;
      if(expr==='hyped'||expr==='laughing'){ ctx.fillStyle='#EE5A6F';ctx.beginPath();ctx.arc(hx,my-hr*0.05,hr*0.34,0.08*Math.PI,0.92*Math.PI);ctx.closePath();ctx.fill(); }
      else if(expr==='shocked'){ ctx.beginPath();ctx.arc(hx,my,hr*0.16,0,Math.PI*2);ctx.stroke(); }
      else if(expr==='determined'){ ctx.beginPath();ctx.moveTo(hx-hr*0.22,my);ctx.lineTo(hx+hr*0.22,my);ctx.stroke(); }
      else if(expr==='smirking'){ ctx.beginPath();ctx.arc(hx+hr*0.08,my-hr*0.05,hr*0.28,0.15*Math.PI,0.7*Math.PI);ctx.stroke(); }
      else { ctx.beginPath();ctx.arc(hx,my-hr*0.05,hr*0.3,0.12*Math.PI,0.88*Math.PI);ctx.stroke(); }
    }
    function drawFigure(t){
      var cue=curCue(t); var idx0=CUES.indexOf(cue); if(idx0<0)idx0=0; var idx=idx0+VAR;
      var pose=POSES[((idx%POSES.length)+POSES.length)%POSES.length];
      var expr=EXPRS[((idx%EXPRS.length)+EXPRS.length)%EXPRS.length];
      var dur=Math.max(0.6,cue.end-cue.start), local=clamp((t-cue.start)/dur,0,1), prog=clamp(local/0.35,0,1);
      var MIN=Math.min(W,H), S=MIN*0.135*(0.78+0.22*prog), bob=Math.sin(t*3)*S*0.03;
      var cx=ACX, cy=ACY+pose.lift*S+bob;
      var LINE=P.dark?'#F2F2F2':'#1E1E1E', FILL=P.accent, SKIN=P.dark?'#20242E':'#FFFFFF';
      var lw=Math.max(6,S*0.11);
      function pt(o){return [cx+o[0]*S,cy+o[1]*S];}
      function line(a,b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
      function mid(a,b,f){return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];}
      function glove(pp){ctx.fillStyle='#FFFFFF';ctx.strokeStyle=LINE;ctx.lineWidth=lw*0.6;ctx.beginPath();ctx.arc(pp[0],pp[1],S*0.16,0,Math.PI*2);ctx.fill();ctx.stroke();}
      function shoe(pp){ctx.fillStyle='#FFFFFF';ctx.strokeStyle=LINE;ctx.lineWidth=lw*0.6;ctx.beginPath();ctx.ellipse(pp[0]+S*0.05,pp[1]+S*0.02,S*0.22,S*0.13,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=FILL;ctx.beginPath();ctx.ellipse(pp[0]+S*0.05,pp[1]-S*0.02,S*0.13,S*0.05,0,0,Math.PI*2);ctx.fill();}
      function rrect(x,y,w2,h2,r2){ctx.beginPath();ctx.moveTo(x+r2,y);ctx.arcTo(x+w2,y,x+w2,y+h2,r2);ctx.arcTo(x+w2,y+h2,x,y+h2,r2);ctx.arcTo(x,y+h2,x,y,r2);ctx.arcTo(x,y,x+w2,y,r2);ctx.closePath();}
      var neck=[cx,cy-S*1.0], hip=[cx,cy+S*0.6];
      var shL=[cx-S*0.30,cy-S*0.82], shR=[cx+S*0.30,cy-S*0.82];
      var hpL=[cx-S*0.20,cy+S*0.55], hpR=[cx+S*0.20,cy+S*0.55];
      var hr=S*0.5, hc=[cx,cy-S*1.5];
      var hL=pt(pose.h[0]),hR=pt(pose.h[1]),fL=pt(pose.f[0]),fR=pt(pose.f[1]);
      ctx.save(); ctx.globalAlpha=prog; ctx.lineCap='round';ctx.lineJoin='round';
      if(CHAR==='round'){
        ctx.fillStyle=FILL;ctx.strokeStyle=LINE;ctx.lineWidth=lw*0.8;
        ctx.beginPath();ctx.ellipse(cx,cy+S*0.15,S*0.78,S*0.95,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.strokeStyle=LINE;ctx.lineWidth=lw;
        line(shL,mid(shL,hL,0.55));line(shR,mid(shR,hR,0.55));line(hpL,mid(hpL,fL,0.6));line(hpR,mid(hpR,fR,0.6));
        glove(mid(shL,hL,0.55));glove(mid(shR,hR,0.55));shoe(mid(hpL,fL,0.6));shoe(mid(hpR,fR,0.6));
        hr=S*0.6; hc=[cx,cy-S*0.78];
        ctx.fillStyle=SKIN;ctx.strokeStyle=LINE;ctx.lineWidth=lw*0.8;
        ctx.beginPath();ctx.arc(hc[0],hc[1],hr,0,Math.PI*2);ctx.fill();ctx.stroke();
        drawFace(hc[0],hc[1],hr,expr,LINE);
      } else if(CHAR==='box'){
        ctx.strokeStyle=LINE;ctx.lineWidth=lw;
        line(shL,hL);line(shR,hR);line(hpL,fL);line(hpR,fR);
        glove(hL);glove(hR);shoe(fL);shoe(fR);
        ctx.fillStyle=FILL;ctx.strokeStyle=LINE;ctx.lineWidth=lw*0.8;
        rrect(cx-S*0.5,cy-S*0.9,S*1.0,S*1.5,S*0.18);ctx.fill();ctx.stroke();
        hr=S*0.55; hc=[cx,cy-S*1.5];
        ctx.strokeStyle=LINE;ctx.lineWidth=lw*0.7;ctx.beginPath();ctx.moveTo(hc[0],hc[1]-hr*0.9);ctx.lineTo(hc[0],hc[1]-hr*1.5);ctx.stroke();
        ctx.fillStyle=FILL;ctx.beginPath();ctx.arc(hc[0],hc[1]-hr*1.6,hr*0.16,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=SKIN;ctx.strokeStyle=LINE;ctx.lineWidth=lw*0.8;
        rrect(hc[0]-hr,hc[1]-hr,hr*2,hr*2,hr*0.35);ctx.fill();ctx.stroke();
        drawFace(hc[0],hc[1],hr,expr,LINE);
      } else {
        ctx.strokeStyle=LINE;ctx.lineWidth=lw;
        line(neck,hip);line(shL,hL);line(shR,hR);line(hpL,fL);line(hpR,fR);
        glove(hL);glove(hR);shoe(fL);shoe(fR);
        ctx.fillStyle=SKIN;ctx.strokeStyle=LINE;ctx.lineWidth=lw*0.9;
        ctx.beginPath();ctx.arc(hc[0],hc[1],hr,0,Math.PI*2);ctx.fill();ctx.stroke();
        drawFace(hc[0],hc[1],hr,expr,LINE);
      }
      ctx.restore();
    }
    function illustration(t){
      if(CHAR!=='none'){ drawDoodles(t); drawFigure(t); return; }
      if(TPL==='pixel')drawPixel(t); else if(TPL==='game')drawGame(t); else {drawDoodles(t);drawSketch(t);}
    }
    function curCue(t){
      for(var i=0;i<CUES.length;i++){ if(t>=CUES[i].start && t<CUES[i].end) return CUES[i]; }
      if(CUES.length && t>=CUES[CUES.length-1].end) return CUES[CUES.length-1];
      return CUES[0];
    }
    function caption(t){
      var cue=curCue(t);
      var fade=clamp((t-cue.start)/0.25,0,1)*clamp((cue.end-t)/0.25,0,1);
      var fs=Math.round(W*0.05), font='800 '+fs+'px '+baseFont;
      var lines=wrap(cue.text,W*0.86,font);
      while(lines.length>3 && fs>Math.round(W*0.032)){fs-=4;font='800 '+fs+'px '+baseFont;lines=wrap(cue.text,W*0.86,font);}
      var lh=fs*1.24,total=lines.length*lh,y0=H*0.82-total+lh/2;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=font;ctx.globalAlpha=fade;
      // outline for legibility over the illustration — dark palette → dark outline; light → light
      ctx.lineJoin='round';ctx.lineWidth=Math.max(4,fs*0.14);
      ctx.strokeStyle= P.dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)';
      ctx.fillStyle=P.ink;
      for(var i=0;i<lines.length;i++){var y=y0+i*lh;ctx.strokeText(lines[i],W/2,y);ctx.fillText(lines[i],W/2,y);}
      ctx.globalAlpha=1;
    }
    function draw(t){
      t=clamp(t,0,DUR); bg(t); illustration(t); caption(t);
      ctx.fillStyle=hexA(P.accent,0.9);ctx.fillRect(0,H-Math.max(4,H*0.008),W*(t/DUR),Math.max(4,H*0.008));
      ctx.globalAlpha=0.4;ctx.textAlign='right';ctx.font='600 '+Math.round(W*0.024)+'px '+baseFont;
      ctx.fillStyle=P.ink;ctx.fillText('Larkwave',W-W*0.05,H-H*0.04);ctx.globalAlpha=1;
    }
    window.TW={duration:DUR,fps:FPS,seek:draw};
    draw(0);
  })();
  </script></body></html>`;
}

/**
 * Overlay <script> that draws timed SUBTITLE captions (one at a time, lower third, white text with a
 * black outline — readable over any art, no underline) on top of a MAIC-drawn art scene. It wraps the
 * existing `window.TW.seek` so each rendered frame = MAIC art + the current caption.
 */
function captionOverlayScript(cues: Cue[], w: number, h: number): string {
  const safe = cues.map((c) => ({ text: c.text.replace(/\s+/g, ' ').trim().slice(0, 220), start: Math.max(0, c.start), end: Math.max(c.start + 0.1, c.end) }));
  const cfg = JSON.stringify({ W: w, H: h, CUES: safe });
  return `<script>(function(){
    var CFG=${cfg}, W=CFG.W, H=CFG.H, CUES=CFG.CUES;
    var oc=document.createElement('canvas');oc.width=W;oc.height=H;
    oc.style.cssText='position:fixed;left:0;top:0;width:'+W+'px;height:'+H+'px;pointer-events:none;z-index:99999';
    document.body.appendChild(oc);
    var ctx=oc.getContext('2d'), fs=Math.round(W*0.052);
    function clamp(v,a,b){return v<a?a:v>b?b:v;}
    function wrap(text,maxW,font){ctx.font=font;var ws=text.split(' '),ls=[],c='';for(var i=0;i<ws.length;i++){var tt=c?c+' '+ws[i]:ws[i];if(ctx.measureText(tt).width>maxW&&c){ls.push(c);c=ws[i];}else c=tt;}if(c)ls.push(c);return ls;}
    function cap(t){
      ctx.clearRect(0,0,W,H);
      var cur=null;for(var i=0;i<CUES.length;i++){if(t>=CUES[i].start&&t<CUES[i].end){cur=CUES[i];break;}}
      if(!cur){if(CUES.length&&t>=CUES[CUES.length-1].end)cur=CUES[CUES.length-1];else return;}
      var fade=clamp((t-cur.start)/0.25,0,1)*clamp((cur.end-t)/0.25,0,1);
      var f=fs, font='800 '+f+'px "Segoe UI",Roboto,Arial,sans-serif';
      var lines=wrap(cur.text,W*0.86,font);
      while(lines.length>3 && f>Math.round(W*0.032)){f-=4;font='800 '+f+'px "Segoe UI",Roboto,Arial,sans-serif';lines=wrap(cur.text,W*0.86,font);}
      var lh=f*1.24, total=lines.length*lh, y0=H*0.82-total+lh/2;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=font;ctx.globalAlpha=fade;
      ctx.lineJoin='round';ctx.lineWidth=Math.max(4,f*0.16);ctx.strokeStyle='rgba(0,0,0,0.9)';ctx.fillStyle='#fff';
      for(var j=0;j<lines.length;j++){var y=y0+j*lh;ctx.strokeText(lines[j],W/2,y);ctx.fillText(lines[j],W/2,y);}
      ctx.globalAlpha=1;
    }
    var tw=window.TW||{duration:0,fps:30,seek:function(){}};
    var orig=typeof tw.seek==='function'?tw.seek:function(){};
    window.TW={duration:tw.duration||0,fps:tw.fps||30,seek:function(t){try{orig(t);}catch(e){} cap(t);}};
    cap(0);
  })();</script>`;
}

/** Composite a MAIC-drawn ART scene (no text) with the timed caption overlay. */
export function composeScene(artHtml: string, cues: Cue[], w: number, h: number): string {
  const overlay = captionOverlayScript(cues, w, h);
  if (/<\/body>/i.test(artHtml)) return artHtml.replace(/<\/body>/i, `${overlay}</body>`);
  return artHtml + overlay;
}
