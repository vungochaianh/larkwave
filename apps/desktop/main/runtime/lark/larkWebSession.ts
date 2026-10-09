import { app, session, type BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LarkBrowserState, LarkReloginEntry, LarkUiTemplate, LarkUiTemplateApplyResult, LarkWebInfo } from '@larkwave/core';
import { LarkHost } from './larkHost';
import { LarkCdpDriver } from './larkCdp';
import { SENSITIVE_UI, isLarkHost } from './larkUiCore';
import { extractTemplate, fillTemplate, loadTemplates, saveTemplates, templateSummary, SAFE_ID, type UiTemplate } from './larkTemplates';
import { hiddenMode } from '../../hiddenMode';
import { canProbeLogin, classifyLarkPage, classifyWhoami, WHOAMI_PATH, type LarkWhoami } from './larkLoginState';
import {
  pageFetchJs,
  recentListPath,
  parseRecentList,
  searchPath,
  parseSearch,
  mergeBases,
  clientVarsPath,
  decodeLarkGz,
  parseBaseMeta,
  parseTableSchema,
  parseAutomationList,
  summarizeWorkflow,
  OBJ_BITABLE,
  type WebBase,
  type WebBaseMeta,
  type WebTable,
  type WebAutomation,
} from './larkWebApi';

/** Hạn giờ cho một lần hỏi "tôi là ai" (xem whoami()). */
const WHOAMI_TIMEOUT_MS = 6000;
/** Khoảng cách tối thiểu giữa hai lần tự hỏi khi người dùng đăng nhập thẳng trong Trình duyệt Lark. */
const VIEW_LOGIN_PROBE_MS = 3000;

/**
 * EXPERIMENTAL — Lark WEB session (not the Open API).
 *
 * Lark's Open API only lists + enables/disables automations; it CANNOT read the workflow
 * LOGIC (trigger/conditions/actions). That logic is only exposed by Lark's INTERNAL web API
 * (`/space/api/bitable/{base}/…`), which authenticates with the web SESSION COOKIES
 * (not our OAuth Bearer token). So we host a hidden persistent BrowserWindow logged into the
 * user's Lark web app and run `fetch()` INSIDE it — same-origin, so the browser attaches the
 * cookies + CSRF automatically (no manual cookie harvesting, least fragile).
 *
 * ⚠️ Private/undocumented API → may break when Lark changes it; a gray area vs Lark ToS. The
 * cookies live in the `persist:` partition (encrypted-at-rest by Chromium) and are ONLY ever
 * sent to Lark's own hosts — never to any AI provider or third party.
 *
 * CONFIRMED endpoints (from the user's real Network traffic):
 *   • LIST (classic Automations):  GET /space/api/bitable/{base}/automation/list   (NO bizType)
 *       → { data: { workflowList: [ {workflowID, status, draft, nodeSchema, extra, ...} ], user: {id:{name}} } }
 *       Each item already EMBEDS the full draft/nodeSchema/extra → no per-item detail call needed.
 *   • DETAIL (both Automations AND node-flow Workflows):
 *       GET /space/api/bitable/{base}/workflow/detail?workflowID={id}&bizType=2  → { data: { workflow: {...} } }
 *   • base (internal) == the Open-API app_token for direct (non-wiki) bases.
 */

// Per-ACCOUNT Electron session partition, so each Larkwave account's Lark web cookies are
// isolated AND persisted (`persist:` → Chromium keeps them on disk, encrypted). Signing back
// into the same account restores the login with no re-auth; another account never sees it.
const PARTITION_PREFIX = 'persist:tw-lark-web-';

// Force a plain Chrome UA for the Lark web window. WITHOUT this the window keeps Electron's
// DEFAULT user-agent, which embeds both the `Electron/…` token AND the host OS (`Macintosh…`
// on macOS vs `Windows NT…` on Windows) — Lark sniffs that string and blocks / renders the
// login page differently per OS, so Windows and macOS behaved differently on "Đăng nhập lại
// Lark web". Pinning ONE UA (same value larkOAuth.ts / authWindow.ts already use) makes login —
// and the in-window connector/sync fetch (doc-os:mac) — behave identically on every platform.
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const LOGIN_MARKERS = /\/(accounts|passport|login|sso|suite\/passport)/i;

// Recognise any internal workflow/automation request across the two service prefixes Lark uses
// (`/space/api/bitable`, `/space/api/base`, `/base/api`) and the several resource names the
// node-flow "Workflow" feature might use (workflow / automation / flow / block_workflow / …).
const WF_PATH = /\/(?:space\/api\/bitable|space\/api\/base|base\/api)\/([^/]+)\/(?:[^/]+\/)?(workflow|workflows|automation|flow|node_?flow|block_?workflow|advance_?workflow)\b/i;
const BITABLE_BASE = /\/space\/api\/bitable\/([^/?]+)/i;
const bit = (b: string) => `/space/api/bitable/${enc(b)}`;

// In-page UI-automation recorder. Injected via executeJavaScript into the logged-in Lark window.
// Uses ONLY generic hooks (monkey-patched fetch/XHR + capture-phase document listeners) so it is
// independent of Lark's (changing) markup. It captures: (a) every workflow/automation network
// request — the REAL request body Lark's own UI sends, incl. whatever schema fields (nodeSchema,
// extra, …) it builds → we stop guessing and replay the exact valid bytes; (b) the user's click/
// change interactions with stable element descriptors → the basis for a future step-by-step driver.
// Idempotent (guards on window.__twWfRec.__on). Returns true, or an 'ERR:…' string.
const RECORDER_JS = `(() => {
  try {
    if (window.__twWfRec && window.__twWfRec.__on) return true;
    var rec = window.__twWfRec = (window.__twWfRec || { net: [], ui: [], __on: false });
    rec.__on = true;
    var WF = /workflow|automation|node_?flow/i;
    function push(arr, item, capN) { arr.push(item); while (arr.length > capN) arr.shift(); }
    function cap(url, method, reqBody, respText) {
      try {
        if (!WF.test(String(url))) return;
        var resp = null; try { resp = JSON.parse(respText); } catch (e) {}
        var req = reqBody;
        try { req = JSON.parse(reqBody); }
        catch (e) {
          // Lark may send the body form-encoded (draft=...&extra=...) — decode so we still get the fields.
          try { if (typeof reqBody === 'string' && reqBody.indexOf('=') >= 0 && reqBody.indexOf('draft') >= 0) { var sp = new URLSearchParams(reqBody); var o = {}; sp.forEach(function (v, k) { o[k] = v; }); if (Object.keys(o).length) req = o; } } catch (e2) {}
        }
        push(rec.net, { t: Date.now(), url: String(url).slice(0, 400), method: String(method || 'GET'), req: req, code: resp && resp.code, msg: resp && resp.msg, dataKeys: (resp && resp.data && typeof resp.data === 'object') ? Object.keys(resp.data).slice(0, 20) : null }, 80);
      } catch (e) {}
    }
    var of = window.fetch;
    if (of && !of.__tw) {
      window.fetch = function (input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var method = (init && init.method) || (input && input.method) || 'GET';
        var body = init && init.body;
        var p = of.apply(this, arguments);
        try { if (WF.test(String(url))) p.then(function (r) { try { r.clone().text().then(function (t) { cap(url, method, (typeof body === 'string' ? body : ''), t); }); } catch (e) {} return r; }); } catch (e) {}
        return p;
      };
      window.fetch.__tw = true;
    }
    var OX = window.XMLHttpRequest;
    if (OX && !OX.__tw) {
      var op = OX.prototype.open, sn = OX.prototype.send;
      OX.prototype.open = function (m, u) { this.__m = m; this.__u = u; return op.apply(this, arguments); };
      OX.prototype.send = function (b) {
        try { var self = this; this.addEventListener('load', function () { try { cap(self.__u, self.__m, (typeof b === 'string' ? b : ''), self.responseText); } catch (e) {} }); } catch (e) {}
        return sn.apply(this, arguments);
      };
      OX.__tw = true;
    }
    function desc(el) {
      if (!el || el.nodeType !== 1) return null;
      var d = { tag: el.tagName ? el.tagName.toLowerCase() : '', id: el.id || '', cls: (el.className && el.className.toString ? el.className.toString().slice(0, 80) : ''), role: (el.getAttribute ? (el.getAttribute('role') || '') : ''), aria: (el.getAttribute ? (el.getAttribute('aria-label') || '') : ''), text: '' };
      try { d.text = (el.innerText || el.textContent || '').trim().slice(0, 60); } catch (e) {}
      try { var da = []; for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (a.name.indexOf('data-') === 0) da.push(a.name + '=' + String(a.value).slice(0, 30)); } d.data = da.slice(0, 6); } catch (e) {}
      return d;
    }
    function path(el) { var out = []; var n = el; for (var i = 0; i < 4 && n && n.nodeType === 1; i++) { out.push(desc(n)); n = n.parentElement; } return out; }
    function onEvt(type) {
      return function (e) {
        try { var el = e.target; if (!el) return; push(rec.ui, { t: Date.now(), type: type, path: path(el), value: (el && el.value !== undefined ? String(el.value).slice(0, 120) : '') }, 600); } catch (er) {}
      };
    }
    document.addEventListener('click', onEvt('click'), true);
    document.addEventListener('change', onEvt('change'), true);
    return true;
  } catch (e) { return 'ERR:' + String((e && e.message) || e); }
})()`;

// Strict in-page Lark host test for the legacy driver (mirrors larkUiCore.isLarkHost).
const LARK_HOST_JS = '/(^|\\.)(larksuite\\.com|larkoffice\\.com|feishu\\.cn|feishu\\.com)$/i';

// SENSITIVE_UI (enable / publish / delete / test-run … in VI/EN/ZH) now lives in larkUiCore.ts and
// is shared by the CDP driver and this legacy in-page driver. (Safety guardrail #1.)

// In-page UI-automation LIBRARY, injected via executeJavaScript in the logged-in Lark window. Pure
// generic DOM tech (Playwright-a11y style) — independent of Lark's markup. Returns an object `L`
// with helpers; the ref registry lives on `window.__twUi` so refs survive across executeJavaScript
// calls in the same document (a navigation wipes it → refs go stale → forced re-snapshot). See the
// design/red-team spec (toolswave-lark-workflow-800004006 memory).
const TW_UI_LIB = `function(){
  var NS = (window.__twUi = window.__twUi || { epoch: 0, refs: new Map(), desc: new Map() });
  function txt(el){ try{ return (el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim(); }catch(e){ return ''; } }
  function isVisible(el){
    try{
      if(!el || el.nodeType!==1) return false;
      var s = getComputedStyle(el);
      if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse') return false;
      if(parseFloat(s.opacity||'1')===0) return false;
      var r = el.getBoundingClientRect();
      if(r.width<1 || r.height<1) return false;
      return true;
    }catch(e){ return false; }
  }
  function accName(el){
    try{
      var n = el.getAttribute && el.getAttribute('aria-label');
      if(!n){ var lb = el.getAttribute && el.getAttribute('aria-labelledby'); if(lb){ n = lb.split(/\\s+/).map(function(id){ var e=document.getElementById(id); return e?txt(e):''; }).join(' ').trim(); } }
      if(!n) n = txt(el);
      if(!n) n = (el.getAttribute && (el.getAttribute('placeholder')||el.getAttribute('title')||el.getAttribute('alt'))) || '';
      if(!n && el.value!==undefined) n = String(el.value);
      return String(n||'').replace(/\\s+/g,' ').trim().slice(0,80);
    }catch(e){ return ''; }
  }
  function role(el){
    var r = el.getAttribute && el.getAttribute('role'); if(r) return r;
    var t = el.tagName.toLowerCase();
    if(t==='a') return 'link';
    if(t==='button') return 'button';
    if(t==='input') return (el.getAttribute('type')||'text');
    if(t==='textarea') return 'textbox';
    if(t==='select') return 'combobox';
    if(el.isContentEditable) return 'textbox';
    return t;
  }
  var INT_TAGS = { a:1, button:1, input:1, textarea:1, select:1, label:1, summary:1 };
  var INT_ROLE = /^(button|link|menuitem|menuitemcheckbox|menuitemradio|option|tab|checkbox|radio|switch|combobox|textbox|searchbox|slider|treeitem)$/;
  function interactive(el){
    var t = el.tagName.toLowerCase();
    if(t==='a') return !!el.getAttribute('href') || !!el.getAttribute('role');
    if(INT_TAGS[t]) return true;
    if(el.isContentEditable) return true;
    var r = el.getAttribute && el.getAttribute('role');
    if(r && INT_ROLE.test(r)) return true;
    if(el.hasAttribute && el.hasAttribute('onclick')) return true;
    var ti = el.getAttribute && el.getAttribute('tabindex');
    if(ti!=null && ti!=='-1') return true;
    return false;
  }
  function setNativeValue(el, v){
    try{
      var proto = el.tagName==='TEXTAREA'? window.HTMLTextAreaElement.prototype : (el.tagName==='SELECT'? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype);
      var d = Object.getOwnPropertyDescriptor(proto,'value');
      if(d && d.set) d.set.call(el, v); else el.value = v;
    }catch(e){ try{ el.value = v; }catch(e2){} }
  }
  function fireMouse(el, type, x, y, btn){
    var Ev = (type.indexOf('pointer')===0 && window.PointerEvent) ? PointerEvent : MouseEvent;
    var init = { bubbles:true, cancelable:true, view:window, clientX:x||0, clientY:y||0 };
    if(btn){ init.button = 0; init.buttons = 1; }
    try{ el.dispatchEvent(new Ev(type, init)); }catch(e){ try{ el.dispatchEvent(new MouseEvent(type, init)); }catch(e2){} }
  }
  var KEYMAP = { Enter:13, Escape:27, Tab:9, ArrowDown:40, ArrowUp:38, ArrowLeft:37, ArrowRight:39, Backspace:8, Delete:46, ' ':32 };
  function fireKey(el, key){
    var kc = KEYMAP[key] || (String(key).length===1? String(key).charCodeAt(0):0);
    ['keydown','keyup'].forEach(function(t){ try{ el.dispatchEvent(new KeyboardEvent(t,{key:key,code:key,keyCode:kc,which:kc,bubbles:true,cancelable:true})); }catch(e){} });
  }
  function walk(MAXEL){
    MAXEL = MAXEL || 200;
    NS.epoch++; NS.refs.clear(); NS.desc.clear();
    var out = []; var blockers = []; var ref = 0;
    function visit(rootDoc, framePath){
      var els; try{ els = rootDoc.querySelectorAll('*'); }catch(e){ return; }
      for(var i=0;i<els.length;i++){
        var el = els[i];
        if(el.shadowRoot){ try{ visit(el.shadowRoot, framePath); }catch(e){} }
        if(el.tagName==='IFRAME'){
          var cd = null; try{ cd = el.contentDocument; }catch(e){ cd = null; }
          if(cd){ try{ visit(cd, framePath+'/'+i); }catch(e){} }
          else { var src=''; try{ src=el.getAttribute('src')||''; }catch(e){} blockers.push({ type:'cross-origin-iframe', src:String(src).slice(0,120) }); }
          continue;
        }
        if(out.length>=MAXEL) continue;
        if(!interactive(el)) continue;
        if(!isVisible(el)) continue;
        var id = ref++;
        NS.refs.set(id, el);
        var nm = accName(el); var rl = role(el);
        NS.desc.set(id, { name:nm, role:rl });
        var b = el.getBoundingClientRect();
        var state = [];
        if(el.disabled || (el.getAttribute && el.getAttribute('aria-disabled')==='true')) state.push('disabled'); else state.push('enabled');
        if(el.getAttribute){
          if(el.getAttribute('aria-checked')==='true'||el.checked) state.push('checked');
          var ax = el.getAttribute('aria-expanded'); if(ax!=null) state.push('expanded='+ax);
          if(el.getAttribute('aria-selected')==='true') state.push('selected');
        }
        var item = { ref:id, tag:el.tagName.toLowerCase(), role:rl, name:nm, frame:framePath, rect:[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)], state:state };
        if(el.value!==undefined) item.value = String(el.value).slice(0,80);
        else if(el.isContentEditable) item.value = txt(el).slice(0,80);
        var ph = el.getAttribute && el.getAttribute('placeholder'); if(ph) item.placeholder = ph;
        out.push(item);
      }
    }
    visit(document, 'main');
    var truncated = out.length>=MAXEL;
    var lines = out.map(function(e){
      var s = '#'+e.ref+' '+e.role+' "'+e.name+'"';
      if(e.value) s += ' value="'+e.value+'"';
      if(e.placeholder) s += ' ph="'+e.placeholder+'"';
      if(e.state && e.state.length) s += ' ['+e.state.join(',')+']';
      if(e.frame && e.frame!=='main') s += ' frame='+e.frame;
      return s;
    });
    blockers.forEach(function(bk){ lines.push('#- iframe [CROSS-ORIGIN BLOCKER src='+bk.src+' — cannot inspect/act]'); });
    return { ok:true, snapshotId:String(NS.epoch), url:location.href, title:document.title, count:out.length, truncated:truncated, elements:out, blockers:blockers, text:lines.join('\\n') };
  }
  function resolveRef(ref){
    var el = NS.refs.get(ref);
    if(el && el.isConnected) return el;
    var d = NS.desc.get(ref); if(!d) return null;
    var all; try{ all = document.querySelectorAll('*'); }catch(e){ return null; }
    for(var i=0;i<all.length;i++){ var e=all[i]; if(!interactive(e)||!isVisible(e)) continue; if(role(e)===d.role && accName(e)===d.name) return e; }
    return null;
  }
  return { NS:NS, txt:txt, isVisible:isVisible, accName:accName, role:role, interactive:interactive, setNativeValue:setNativeValue, fireMouse:fireMouse, fireKey:fireKey, walk:walk, resolveRef:resolveRef };
}`;

// The lark_ui_act verb body. Assumes in scope: L (TW_UI_LIB instance), a (the parsed action input),
// SENS (SENSITIVE_UI regex). React-safe techniques: native prototype value setter + input/change for
// fill; pointerdown/up THEN native click for click; custom-combobox opens then the agent re-snapshots.
const UI_ACT_BODY = `
  var el = L.resolveRef(a.ref);
  if(!el) return { ok:false, error:'stale-ref', ref:a.ref, hint:'Snapshot lại rồi tìm theo tên+vai trò.' };
  var _name = L.accName(el); var _role = L.role(el);
  if(!L.isVisible(el)){ try{ el.scrollIntoView({block:'center'}); }catch(e){} if(!L.isVisible(el)) return { ok:false, error:'not-visible', ref:a.ref, target:{name:_name,role:_role} }; }
  var act = a.action || 'click';
  if((act==='click'||act==='dblclick') && !a.force && SENS.test(_name)) return { ok:false, error:'requires-confirm', blocked:'sensitive-action', target:{name:_name,role:_role}, hint:'BẬT/XOÁ không hoàn tác được — DỪNG, để người dùng tự bấm trong Lark.' };
  var _beforeUrl = location.href; var _beforeLen = document.body? document.body.innerHTML.length : 0;
  try {
    var rect = el.getBoundingClientRect(); var x = rect.left+rect.width/2, y = rect.top+rect.height/2;
    if(act==='fill'||act==='clear'){
      if(el.disabled) return { ok:false, error:'disabled', target:{name:_name,role:_role} };
      var val = act==='clear' ? '' : String(a.value==null?'':a.value);
      if(el.isContentEditable){ el.focus(); try{ getSelection().selectAllChildren(el); document.execCommand('insertText',false,val); }catch(e){ el.textContent=val; } el.dispatchEvent(new InputEvent('input',{bubbles:true,data:val})); }
      else { el.focus(); L.setNativeValue(el,val); el.dispatchEvent(new InputEvent('input',{bubbles:true,data:val})); el.dispatchEvent(new Event('change',{bubbles:true})); }
      if(a.submit) L.fireKey(el,'Enter');
    } else if(act==='press'){ L.fireKey(el, a.key||'Enter'); }
    else if(act==='hover'){ L.fireMouse(el,'pointerover',x,y); L.fireMouse(el,'mouseover',x,y); L.fireMouse(el,'mousemove',x,y); }
    else if(act==='scrollIntoView'){ el.scrollIntoView({block:'center',inline:'center'}); }
    else if(act==='scrollBy'){ var sc=el; while(sc && sc!==document.body){ var st=getComputedStyle(sc); if(/(auto|scroll)/.test(st.overflowY) && sc.scrollHeight>sc.clientHeight) break; sc=sc.parentElement; } var tgt=(sc&&sc!==document.body)?sc:window; try{ tgt.scrollBy(a.dx||0, a.dy||300); }catch(e){ window.scrollBy(a.dx||0, a.dy||300); } }
    else if(act==='select'){
      if(el.disabled) return { ok:false, error:'disabled' };
      if(el.tagName==='SELECT'){ var opt=null; for(var i=0;i<el.options.length;i++){ var o=el.options[i]; if((o.text||'').trim()===String(a.value).trim() || o.value===a.value){ opt=o; break; } } if(!opt) return { ok:false, error:'option-not-found', options: Array.prototype.slice.call(el.options).map(function(o){return o.text;}).slice(0,30) }; L.setNativeValue(el,opt.value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
      else { if(el.focus) el.focus(); L.fireMouse(el,'pointerdown',x,y,true); L.fireMouse(el,'mousedown',x,y,true); L.fireMouse(el,'pointerup',x,y); L.fireMouse(el,'mouseup',x,y); if(typeof el.click==='function') el.click(); return { ok:true, action:act, note:'combobox-opened', hint:'Danh sách mở ở portal — snapshot lại rồi click đúng option.' }; }
    } else {
      var _times = act==='dblclick'?2:1;
      for(var k=0;k<_times;k++){ L.fireMouse(el,'pointerover',x,y); L.fireMouse(el,'mouseover',x,y); L.fireMouse(el,'pointerdown',x,y,true); L.fireMouse(el,'mousedown',x,y,true); try{ el.focus({preventScroll:true}); }catch(e){} L.fireMouse(el,'pointerup',x,y); L.fireMouse(el,'mouseup',x,y); }
      if(typeof el.click==='function') el.click(); else L.fireMouse(el,'click',x,y);
      if(act==='dblclick') L.fireMouse(el,'dblclick',x,y);
    }
  } catch(e){ return { ok:false, error:String((e&&e.message)||e), target:{name:_name,role:_role} }; }
  await new Promise(function(res){ requestAnimationFrame(function(){ setTimeout(res,80); }); });
  return { ok:true, action:act, ref:a.ref, target:{name:_name,role:_role}, urlChanged:_beforeUrl!==location.href, domChanged:_beforeLen!==(document.body?document.body.innerHTML.length:0), url:location.href };
`;

// APP-INSPECT in-page HOOK — install error/network capture into window.__twHealth so a Lark aPaaS
// app's LOADING problems become visible: JS errors, unhandled rejections, console.error, failed
// fetch/XHR (status≥400) AND Lark "soft errors" (HTTP 200 body {code≠0, msg}). Idempotent.
const APP_HEALTH_HOOK = `(() => {
  try {
    if (window.__twHealth && window.__twHealth.__on) return true;
    var H = window.__twHealth = (window.__twHealth || { __on:false, errors:[], failed:[] });
    H.__on = true;
    function pushErr(s){ try{ H.errors.push(String(s).slice(0,300)); while(H.errors.length>40) H.errors.shift(); }catch(e){} }
    function pushFail(o){ try{ H.failed.push(o); while(H.failed.length>40) H.failed.shift(); }catch(e){} }
    window.addEventListener('error', function(e){ pushErr((e && (e.message || (e.error && e.error.message))) || 'error'); }, true);
    window.addEventListener('unhandledrejection', function(e){ pushErr('unhandledrejection: ' + ((e && e.reason && (e.reason.message||e.reason)) || '')); });
    try { var oce = console.error; console.error = function(){ try{ pushErr(Array.prototype.map.call(arguments,function(a){ return (a && a.message) ? a.message : String(a); }).join(' ')); }catch(e){} return oce.apply(this, arguments); }; } catch(e){}
    var of = window.fetch;
    if (of && !of.__twh) {
      window.fetch = function(input, init){
        var url = (typeof input==='string') ? input : (input && input.url) || '';
        var p = of.apply(this, arguments);
        try { p.then(function(r){ try {
          if (r && r.status >= 400) pushFail({ url:String(url).slice(0,200), status:r.status });
          else if (r && (''+url).indexOf('/space/api')>=0) { r.clone().text().then(function(t){ try{ var j=JSON.parse(t); if(j && typeof j.code!=='undefined' && j.code!==0) pushFail({ url:String(url).slice(0,200), status:r.status, code:j.code, msg:String(j.msg||'').slice(0,120) }); }catch(_){} }); }
        } catch(_){} return r; }, function(err){ pushFail({ url:String(url).slice(0,200), error:String((err&&err.message)||err).slice(0,120) }); }); } catch(e){}
        return p;
      };
      window.fetch.__twh = true;
    }
    var OX = window.XMLHttpRequest;
    if (OX && !OX.__twh) {
      var op = OX.prototype.open, sn = OX.prototype.send;
      OX.prototype.open = function(m,u){ this.__u=u; return op.apply(this, arguments); };
      OX.prototype.send = function(b){ try{ var self=this; this.addEventListener('load', function(){ try{ if(self.status>=400) pushFail({ url:String(self.__u).slice(0,200), status:self.status }); else if((''+self.__u).indexOf('/space/api')>=0){ try{ var j=JSON.parse(self.responseText); if(j && typeof j.code!=='undefined' && j.code!==0) pushFail({ url:String(self.__u).slice(0,200), status:self.status, code:j.code, msg:String(j.msg||'').slice(0,120) }); }catch(_){} } }catch(_){} }); this.addEventListener('error', function(){ pushFail({ url:String(self.__u).slice(0,200), error:'xhr-error' }); }); }catch(e){} return sn.apply(this, arguments); };
      OX.__twh = true;
    }
    return true;
  } catch(e){ return 'ERR:'+String((e&&e.message)||e); }
})()`;

// APP-INSPECT COLLECT — a runUi body (L = TW_UI_LIB in scope) that reads window.__twHealth + probes
// the DOM (spinner stuck / empty root / error banner) + walks the control surface, then classifies
// status: ok | empty | stuck | error.
const APP_HEALTH_COLLECT = `
  var H = window.__twHealth || { errors:[], failed:[] };
  var ERRLEX = /(无权限|没有权限|不存在|加载失败|页面不存在|không có quyền|không tồn tại|tải thất bại|permission denied|no permission|not found|failed to load|access denied|forbidden|404|500)/i;
  function vis(el){ try{ var s=getComputedStyle(el); if(s.display==='none'||s.visibility==='hidden'||parseFloat(s.opacity||'1')===0) return false; var r=el.getBoundingClientRect(); return r.width>1&&r.height>1; }catch(e){ return false; } }
  var spinnerVisible=false;
  try { var sp=document.querySelectorAll('[class*=spin],[class*=Spin],[class*=loading],[class*=Loading],[class*=loader],[role=progressbar]'); for(var i=0;i<sp.length;i++){ if(vis(sp[i])){ spinnerVisible=true; break; } } }catch(e){}
  var rootFilled=false;
  try { var root=document.querySelector('#root,#app,[id*=app-root],main')||document.body; rootFilled = !!root && (root.getBoundingClientRect().height>120) && (root.querySelectorAll('*').length>30) && ((root.innerText||'').trim().length>0); }catch(e){}
  var bannerTexts=[];
  try { var all=document.querySelectorAll('body *'); for(var j=0;j<all.length && bannerTexts.length<6;j++){ var e2=all[j]; if(!vis(e2)) continue; if(e2.children.length>2) continue; var t=(e2.innerText||'').trim(); if(t && t.length<120 && ERRLEX.test(t)){ if(bannerTexts.indexOf(t)<0) bannerTexts.push(t); } } }catch(e){}
  var snap = L.walk(120);
  var controls = snap.elements || [];
  var failed = H.failed || [];
  var errors = H.errors || [];
  var status = 'ok';
  if(bannerTexts.length>0 || failed.length>0) status='error';
  else if(spinnerVisible && !rootFilled) status='stuck';
  else if(!rootFilled && controls.length===0 && (!snap.blockers||snap.blockers.length===0)) status='empty';
  return { ok:true, status:status, url:location.href, title:document.title, spinnerVisible:spinnerVisible, rootFilled:rootFilled, bannerTexts:bannerTexts, consoleErrors:errors.slice(-12), failedRequests:failed.slice(-15), controlCount:controls.length, blockers:snap.blockers||[], controls: controls.slice(0,60), controlsText: (snap.text||'').slice(0,4000) };
`;

export class LarkWebSession {
  private win: LarkHost | null = null;
  /** CDP driver bound to the current Lark webContents (falls back to the legacy JS driver). */
  readonly cdp = new LarkCdpDriver();
  /** Which driver produced the LAST snapshot (its refs are only valid for that driver). */
  private uiMode: 'cdp' | 'legacy' = 'cdp';
  /** "Trình duyệt Lark" screen: the main window + rect the page is embedded at (null = detached). */
  private embedTarget: { win: BrowserWindow; rect: { x: number; y: number; width: number; height: number } } | null = null;
  /** A visible-login connect() is waiting for the user (so a detach must re-show the popup). */
  private loginPending = false;
  /** The main window: the Lark page PARKS there off-screen so it keeps painting (see larkHost.ts). */
  private parkingWin: BrowserWindow | null = null;
  private host: string | null = null; // e.g. https://lsgav2gopb4m.sg.larksuite.com
  /** Active account scope (sanitized userId | '_local'); drives the partition name. */
  private scope = '_local';
  private poll: ReturnType<typeof setInterval> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** EVERY workflow/automation request path the Lark web app made (newest first, deduped). We
   *  probe them ALL + validate the RESPONSE shape, so a config/limits endpoint can't masquerade
   *  as the workflow list. */
  private capturedPaths: string[] = [];
  /** Other internal API paths that MENTION workflow/flow but didn't match WF_PATH — kept purely
   *  for diagnostics so a single user click can reveal an endpoint shape we don't know yet. */
  private capturedOther: string[] = [];
  /** Latest `docs-host-id` / `docs-host-type` / `x-csrftoken` seen on a /space/api/ request —
   *  used to build a connector session for the CMS Bitable sync (see getConnectorSession). */
  private capturedHostId = '';
  private capturedHostType = '';
  private capturedCsrf = '';
  private listenerReady = false;
  /** Last known session health (updated by probeHealth + the reactive login-detection path). */
  private lastHealth: 'alive' | 'dead' | 'unknown' = 'unknown';
  /** Fired when we DETECT the session died (reactive API call OR a probe) — larkService wires
   *  this to an OS Notification + a renderer banner so the user is told to re-login immediately. */
  private deadHandler: (() => void) | null = null;
  /** Persisted log of Lark web re-login events (local button + remote phone-QR), newest first,
   *  capped at 30. Lets the CMS screen show a "lịch sử đăng nhập lại" audit. */
  private reloginHistory: LarkReloginEntry[] | null = null;
  /** UI-automation recorder: when armed, an in-page recorder (RECORDER_JS) is (re)injected on
   *  every load so it survives SPA reloads. It captures workflow/automation network requests
   *  (the EXACT valid body Lark's own UI sends — no more guessing the internal schema) + the
   *  user's UI interactions (basis for a future step-by-step driver). See startRecorder(). */
  private recorderArmed = false;
  /** Latest VALID workflow save/update request body captured from Lark's OWN UI (draft/extra/…
   *  exactly as Lark built them). replayCapturedWorkflow() re-sends it to create a real copy. */
  private capturedWfPayload: { baseId: string; rawBody: J; triggerName: string } | null = null;
  /** UI-driver action budget for the current drive session — reset on uiOpen, hard-capped so a
   *  confused agent can't thrash the user's live Lark account indefinitely (guardrail). */
  private uiActs = 0;
  /** App-inspect: when armed, APP_HEALTH_HOOK is re-injected on every load AND the main process
   *  captures console errors + hard load failures into `inspectLog` — so lark_app_inspect can
   *  diagnose LOADING problems in a Lark aPaaS app (spinner/empty/permission/soft-error code≠0),
   *  which a plain DOM snapshot can't see. Reset at the start of each appInspect(). */
  private inspectArmed = false;
  private inspectLog: { consoleErrors: string[]; failedLoads: J[] } = { consoleErrors: [], failedLoads: [] };

  constructor() {
    this.installSniffer();
  }

  // ── re-login history (audit for the CMS screen) ─────────────────────────────
  private historyFile(): string {
    return join(app.getPath('userData'), `lark-relogin-${this.scope}.json`);
  }
  private loadHistory(): LarkReloginEntry[] {
    if (this.reloginHistory) return this.reloginHistory;
    try {
      const raw = JSON.parse(readFileSync(this.historyFile(), 'utf8'));
      this.reloginHistory = Array.isArray(raw) ? (raw as LarkReloginEntry[]) : [];
    } catch {
      this.reloginHistory = [];
    }
    return this.reloginHistory;
  }
  /** Append a re-login attempt (newest first, capped) + persist. Best-effort. */
  recordRelogin(source: 'local' | 'remote', outcome: 'success' | 'failed' | 'timeout'): void {
    const h = this.loadHistory();
    h.unshift({ at: new Date().toISOString(), source, outcome, host: this.host ?? undefined });
    this.reloginHistory = h.slice(0, 30);
    try {
      writeFileSync(this.historyFile(), JSON.stringify(this.reloginHistory));
    } catch {
      /* best-effort */
    }
  }
  getReloginHistory(): LarkReloginEntry[] {
    return this.loadHistory();
  }

  /** Register the "session died" handler (larkService → OS Notification + renderer push). */
  setDeadHandler(cb: () => void): void {
    this.deadHandler = cb;
  }

  /** Mark the session dead + fire the handler once (deduped by lastHealth transition). */
  private markDead(): void {
    const was = this.lastHealth;
    this.lastHealth = 'dead';
    if (was !== 'dead') {
      try {
        this.deadHandler?.();
      } catch {
        /* handler is best-effort */
      }
    }
  }

  /**
   * Proactive health probe: run a cheap same-origin fetch inside the window and classify the
   * result as alive | dead | unknown by reusing the login-redirect heuristic. Only returns
   * 'dead' on a CLEAR login signal (never on a transient network error → 'unknown'), so it can't
   * false-alarm. Updates lastHealth (and fires the dead handler on an alive→dead transition).
   */
  async probeHealth(): Promise<'alive' | 'dead' | 'unknown'> {
    if (!this.win || this.win.isDestroyed() || !this.host) return 'unknown';
    // Real signal first: Lark's own "who am I". Anonymous = definitively logged out.
    const w = await this.whoami();
    if (w.loggedIn) {
      this.lastHealth = 'alive';
      return 'alive';
    }
    if (w.anonymous) {
      this.markDead();
      return 'dead';
    }
    let res: RawResult;
    try {
      res = await this.rawCall('/', 'GET');
    } catch {
      return 'unknown';
    }
    if (res?.error) return 'unknown';
    const where = `${res?.finalUrl || ''} ${res?.pageUrl || ''}`;
    const looksLogin =
      LOGIN_MARKERS.test(where) || /login|passport|sign\s?in|đăng nhập|log in/i.test(res?.snippet || '');
    if (looksLogin) {
      this.markDead();
      return 'dead';
    }
    this.lastHealth = 'alive';
    return 'alive';
  }

  /** Ask Lark "who am I" from inside the page (same-origin, the page's own cookies). */
  private async whoami(): Promise<LarkWhoami & { asked: boolean }> {
    if (!this.win || this.win.isDestroyed()) return { loggedIn: false, anonymous: false, asked: false };
    try {
      // Có hạn giờ: executeJavaScript có thể KHÔNG BAO GIỜ trả lời khi trang đang chuyển hướng (đúng
      // lúc vừa đăng nhập xong Lark nhảy trang). Không có hạn giờ thì vòng chờ ở connect() — vốn bỏ
      // qua lượt khi lượt trước chưa xong — đứng im mãi ở "Đang chờ đăng nhập" dù đã đăng nhập.
      const ask = this.win.webContents.executeJavaScript(
        `fetch(${JSON.stringify(WHOAMI_PATH)}, { credentials: 'include', headers: { accept: 'application/json' } }).then(function (r) { return r.json(); }).catch(function () { return null; })`,
        true,
      ).catch(() => null);
      const j = await Promise.race([ask, new Promise<null>((r) => setTimeout(() => r(null), WHOAMI_TIMEOUT_MS))]);
      return { ...classifyWhoami(j), asked: j != null };
    } catch {
      return { loggedIn: false, anonymous: false, asked: false };
    }
  }

  /** REAL login signal: Lark says a non-anonymous user is signed in (see larkLoginState.ts).
   *  Returns the origin to remember (the tenant domain Lark reports, else the page's origin). */
  private async isRealLogin(url: string): Promise<string | null> {
    if (!canProbeLogin(url)) return null;
    const w = await this.whoami();
    if (!w.loggedIn) return null;
    return w.domain ? `https://${w.domain}` : safeOrigin(url);
  }

  private partitionName(): string {
    return PARTITION_PREFIX + this.scope;
  }

  /**
   * Switch to a Larkwave account's Lark-web partition. Closes the current window and resets
   * the in-memory connection (the new account's cookies live in a different partition). The
   * sniffer is re-installed on the new partition. Call `reconnect(host)` afterwards to silently
   * restore a remembered login.
   */
  setScope(scope: string): void {
    const s = scope || '_local';
    if (s === this.scope) return;
    this.destroyWindow();
    this.host = null;
    this.capturedPaths = [];
    this.capturedOther = [];
    this.capturedHostId = '';
    this.capturedHostType = '';
    this.capturedCsrf = '';
    this.capturedWfPayload = null;
    this.scope = s;
    this.listenerReady = false;
    this.installSniffer();
  }

  /**
   * Silently restore a REMEMBERED web connection using the account's persisted cookies. Opens a
   * HIDDEN window to `host`; if it settles on a logged-in Lark page we're connected with no user
   * action. If the cookies expired (it lands on a login page) we give up quietly — the user
   * reconnects when they choose. Best-effort; never throws.
   */
  async reconnect(host: string): Promise<LarkWebInfo> {
    const origin = safeOrigin(host);
    if (!origin) return { connected: false };
    this.destroyWindow();
    const win = this.makeWindow(false); // hidden
    this.win = win;
    return new Promise<LarkWebInfo>((resolve) => {
      let settled = false;
      let checking = false;
      let misses = 0;
      const done = (info: LarkWebInfo) => {
        if (settled) return;
        settled = true;
        this.clearTimers();
        resolve(info);
      };
      const poll = setInterval(() => {
        if (!win || win.isDestroyed()) return done({ connected: false });
        let url = '';
        try {
          url = win.webContents.getURL();
        } catch {
          return;
        }
        if (!url || !/larksuite\.com|feishu\.(cn|com)/i.test(url)) return;
        const kind = classifyLarkPage(url);
        if (kind === 'login') {
          // Cookies expired → not logged in. Drop the window; stay disconnected silently.
          this.destroyWindow();
          return done({ connected: false });
        }
        if (checking) return;
        checking = true;
        void this.isRealLogin(url).then((origin) => {
          checking = false;
          if (settled) return;
          if (!origin) {
            // Public site / no session cookie → NOT a restored login (was a false "connected").
            if (kind === 'public' || ++misses >= 3) {
              this.destroyWindow();
              done({ connected: false });
            }
            return;
          }
          this.host = origin;
          this.lastHealth = 'alive';
          done({ connected: true, host: this.host ?? undefined });
        });
      }, 800);
      // Background restore: give up after 20s (vs 5min for an interactive login).
      const timer = setTimeout(() => {
        if (!this.host) this.destroyWindow();
        done({ connected: !!this.host, host: this.host ?? undefined });
      }, 20_000);
      this.poll = poll;
      this.timer = timer;
      win.on('closed', () => {
        this.win = null;
        done({ connected: !!this.host });
      });
      win.webContents.on('did-fail-load', (_e, _c, _d, _u, isMain) => {
        if (isMain) {
          this.destroyWindow();
          done({ connected: false });
        }
      });
      void win.loadURL(origin, { userAgent: CHROME_UA });
    });
  }

  /** Listen to the Lark web app's OWN network calls on our partition. When the user opens a
   *  Base's Automation/Workflow panel, Lark fires the internal list request — we capture its path. */
  private installSniffer(): void {
    if (this.listenerReady) return;
    this.listenerReady = true; // set FIRST so a partial-registration failure can't double-add
    try {
      const ses = session.fromPartition(this.partitionName());
      ses.webRequest.onBeforeRequest({ urls: ['*://*/space/api/*', '*://*/base/api/*'] }, (details, cb) => {
        this.noteWorkflowRequest(details.url);
        cb({});
      });
      // Capture the docs-host-id / docs-host-type / csrf headers Lark's web app sends on its
      // internal /space/api calls — needed to build a valid connector session for the CMS sync
      // (cookies alone aren't always enough; the connector endpoint wants these headers too).
      ses.webRequest.onSendHeaders({ urls: ['*://*/space/api/*'] }, (details) => {
        const h = details.requestHeaders || {};
        const pick = (k: string) => {
          const lk = k.toLowerCase();
          for (const key of Object.keys(h)) if (key.toLowerCase() === lk) return h[key];
          return '';
        };
        const hostId = pick('docs-host-id');
        const hostType = pick('docs-host-type');
        const csrf = pick('x-csrftoken');
        if (hostId) this.capturedHostId = hostId;
        if (hostType) this.capturedHostType = hostType;
        if (csrf) this.capturedCsrf = csrf;
      });
    } catch {
      this.listenerReady = false; // never registered → allow a later retry
    }
  }

  /**
   * Build a CONNECTOR session for the CMS Bitable sync: the current Lark web cookies (incl.
   * httpOnly — the browser sends them anyway on a same-origin call), the `_csrf_token`, plus the
   * docs-host-id/type last seen from a real /space/api request. Returns null when web isn't
   * connected. This is the value that used to be captured manually via the browser extension —
   * here it's always FRESH (the session persists + auto-reconnects per account), so a CMS sync
   * job never goes stale.
   */
  async getConnectorSession(): Promise<{
    domain: string;
    cookies: string;
    csrfToken: string;
    hostId: string;
    hostType: string;
  } | null> {
    if (!this.host) return null;
    let domain = '';
    try {
      domain = new URL(this.host).host;
    } catch {
      return null;
    }
    try {
      const ses = session.fromPartition(this.partitionName());
      const cookies = await ses.cookies.get({ url: this.host });
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      if (!cookieStr) return null;
      const csrfCookie = cookies.find((c) => c.name === '_csrf_token');
      const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.value) : this.capturedCsrf || '';
      return {
        domain,
        cookies: cookieStr,
        csrfToken,
        hostId: this.capturedHostId || '',
        hostType: this.capturedHostType || 'Wiki',
      };
    } catch {
      return null;
    }
  }

  private note(path: string): void {
    if (!this.capturedPaths.includes(path)) this.capturedPaths = [path, ...this.capturedPaths].slice(0, 16);
  }

  private noteWorkflowRequest(url: string): void {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      if (WF_PATH.test(u.pathname)) {
        this.note(path);
        return;
      }
      // Diagnostics: any other internal call that mentions workflow/flow/automation/process.
      if (/(workflow|flow|automation|process|自动化|流程)/i.test(path) && !this.capturedOther.includes(path))
        this.capturedOther = [path, ...this.capturedOther].slice(0, 20);
    } catch {
      /* ignore */
    }
  }

  /** All captured endpoint paths (workflow-matched first, then diagnostic "other"). */
  capturedInfo(): string[] {
    return [...this.capturedPaths, ...this.capturedOther];
  }

  /** workflowIDs seen in captured `…/workflow/detail?workflowID=…` requests — i.e. flowchart
   *  Workflows the user OPENED inside the app's Lark window (the sniffer saw each one). Lets us
   *  read them even when we don't know the base's node-tree LIST endpoint. */
  capturedWorkflowIds(): string[] {
    const ids: string[] = [];
    for (const p of [...this.capturedPaths, ...this.capturedOther]) {
      const m = /workflowID=(\d{6,})/i.exec(p);
      if (m && !ids.includes(m[1])) ids.push(m[1]);
    }
    return ids;
  }

  /** Manually set the endpoint from a pasted full/relative URL (sniffer fallback). */
  setCapturedUrl(url: string): string[] {
    const path = /^https?:\/\//i.test(url) ? (() => { const u = new URL(url); return u.pathname + u.search; })() : url;
    if (!WF_PATH.test(path)) throw new Error('URL không chứa đường dẫn workflow/automation nội bộ của Lark (…/workflow… hoặc …/automation…).');
    this.note(path);
    return this.capturedPaths;
  }

  /** Current best-effort status. `connected` is false if the window/host is gone OR the last
   *  probe / a live call found the cookies expired (lastHealth==='dead') — so the UI stops
   *  showing a stale green "connected" tag after the session silently dies. */
  status(): LarkWebInfo {
    const alive = !!this.win && !this.win.isDestroyed() && !!this.host && this.lastHealth !== 'dead';
    return { connected: alive, host: this.host ?? undefined };
  }

  private makeWindow(show: boolean): LarkHost {
    const win = new LarkHost(this.partitionName(), 'Đăng nhập Lark (Larkwave)', this.parkingWin);
    this.cdp.bind(win.webContents);
    // The "Trình duyệt Lark" screen is open → the (new) page appears inside the app, not as a popup.
    if (this.embedTarget) win.embed(this.embedTarget.win, this.embedTarget.rect);
    if (show) {
      // Reveal once the first frame is painted; if Lark is slow/blocked, a fallback timer still
      // surfaces the (now white) window so the user is never left staring at nothing.
      let shown = false;
      const reveal = () => {
        if (shown || win.isDestroyed()) return;
        shown = true;
        try {
          win.show();
        } catch {
          /* ignore */
        }
      };
      win.once('ready-to-show', reveal);
      setTimeout(reveal, 1500);
    }
    // Pin the UA (see CHROME_UA note) so login + in-window fetch look identical on mac & Windows.
    try {
      win.webContents.setUserAgent(CHROME_UA);
    } catch {
      /* setUserAgent is best-effort */
    }
    // Lark's login page tries to open its NATIVE app via a custom-scheme deep link
    // (larksuite:// / feishu://) and pops SSO in child windows. WITHOUT a handler here (the
    // OAuth windows in authWindow.ts / larkOAuth.ts already have one, this window did NOT), a
    // custom-scheme navigation makes Windows show a "which app do you want to open this with?"
    // dialog (the "deeplink lạ") while macOS silently swallows it → the two platforms diverge.
    win.webContents.setWindowOpenHandler(({ url }) => {
      // Non-http(s) (larksuite://, feishu://, mailto:, …) → never let the OS deep-link fire.
      if (!/^https?:\/\//i.test(url)) return { action: 'deny' };
      // Real SSO popups (Google/Microsoft/Apple/…) → allow, but keep them on OUR partition +
      // pinned UA so the popup's login writes cookies the poll can see and behaves the same.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: !hiddenMode(),
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: this.partitionName() },
        },
      };
    });
    // A child SSO popup keeps Electron's default UA unless we override it too.
    win.webContents.on('did-create-window', (child) => {
      try {
        child.webContents.setUserAgent(CHROME_UA);
      } catch {
        /* best-effort */
      }
    });
    // Block the MAIN frame from being yanked onto a custom scheme (larksuite:// deep link) —
    // this is what popped the Windows "open with" dialog mid-login.
    win.webContents.on('will-navigate', (e, url) => {
      if (!/^https?:\/\//i.test(url)) e.preventDefault();
    });
    // Re-arm the recorder / app-health hook after any full page load (Lark's SPA can hard-reload)
    // so capture survives navigation. No-ops unless a record / inspect session is active.
    win.webContents.on('did-finish-load', () => {
      if (this.recorderArmed) win.webContents.executeJavaScript(RECORDER_JS, true).catch(() => undefined);
      if (this.inspectArmed) win.webContents.executeJavaScript(APP_HEALTH_HOOK, true).catch(() => undefined);
    });
    // App-inspect main-process capture: console errors + hard load failures from time-zero (before
    // any in-page hook could run). Gated on inspectArmed so it's inert outside an inspect.
    win.webContents.on('console-message', (_e, level, message) => {
      if (this.inspectArmed && level >= 2) {
        this.inspectLog.consoleErrors.push(String(message).slice(0, 300));
        if (this.inspectLog.consoleErrors.length > 40) this.inspectLog.consoleErrors.shift();
      }
    });
    win.webContents.on('did-fail-load', (_e, code, desc, failedUrl, isMain) => {
      if (this.inspectArmed && isMain) this.inspectLog.failedLoads.push({ code, desc: String(desc).slice(0, 120), url: String(failedUrl).slice(0, 200) });
    });
    return win;
  }

  /**
   * Open a VISIBLE window to the user's Lark workspace so they log in (SSO/QR). Resolves once
   * the window has settled on a NON-login page on a Lark host (→ logged in), then hides the
   * window for reuse. `startUrl` should be any URL from the user's Lark workspace (base/wiki).
   */
  async connect(startUrl?: string): Promise<LarkWebInfo> {
    const origin = safeOrigin(startUrl) || 'https://www.larksuite.com';
    // Fresh window each connect attempt (reuse the persisted partition).
    this.destroyWindow();
    const win = this.makeWindow(true);
    this.win = win;
    this.loginPending = true;

    return new Promise<LarkWebInfo>((resolve) => {
      let settled = false;
      let checking = false;
      const done = (info: LarkWebInfo) => {
        if (settled) return;
        settled = true;
        this.loginPending = false;
        this.clearTimers();
        resolve(info);
      };

      // Poll the window URL: once it's on a Lark host and NOT a login/accounts page, the user
      // is logged in → capture the (possibly redirected shard) host, hide the window, keep it.
      const poll = setInterval(() => {
        if (!win || win.isDestroyed()) return done({ connected: false, error: 'Cửa sổ đã đóng.' });
        let url = '';
        try {
          url = win.webContents.getURL();
        } catch {
          return;
        }
        if (!url || !/larksuite\.com|feishu\.(cn|com)/i.test(url)) return;
        if (!canProbeLogin(url)) return; // login/SSO page → keep waiting
        if (checking) return;
        checking = true;
        void this.isRealLogin(url).then((origin) => {
          checking = false;
          if (!origin || settled) return; // anonymous visitor (e.g. the public site) is not a login
          // Lark confirms a real (non-anonymous) user.
          this.host = origin;
          this.lastHealth = 'alive';
          this.recordRelogin('local', 'success');
          try {
            win.hide();
          } catch {
            /* ignore */
          }
          done({ connected: true, host: this.host ?? undefined });
        });
      }, 1200);

      // 5 minutes to complete login (QR/SSO), then give up (keep the window for retry).
      const timer = setTimeout(() => done({ connected: false, error: 'Hết thời gian chờ đăng nhập.' }), 300_000);
      this.poll = poll;
      this.timer = timer;

      win.on('closed', () => {
        this.win = null;
        done({ connected: !!this.host, host: this.host ?? undefined, error: this.host ? undefined : 'Bạn đã đóng cửa sổ trước khi đăng nhập xong.' });
      });
      win.webContents.on('did-fail-load', (_e, code, _d, _u, isMainFrame) => {
        if (isMainFrame) done({ connected: false, error: `Không tải được Lark (mã ${code}).` });
      });

      void win.loadURL(origin, { userAgent: CHROME_UA });
    });
  }

  /** Re-show the login window (e.g. session expired → user re-authenticates). */
  reveal(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      this.win.focus();
    }
  }

  // ── UI-automation: record real Lark UI + capture the valid workflow request ──────────────────

  /** Arm the in-page recorder + reveal the window (optionally navigate to `url`). The recorder
   *  re-injects on every load (did-finish-load) so it survives Lark's SPA reloads. The user then
   *  creates a workflow BY HAND in the window; we capture the exact valid request Lark sends. */
  async startRecorder(url?: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'Chưa kết nối Lark web — hãy Kết nối/Đăng nhập trước.' };
    this.recorderArmed = true;
    this.reveal();
    if (url && /^https?:\/\//i.test(url)) {
      try {
        await this.win.webContents.loadURL(url, { userAgent: CHROME_UA });
      } catch {
        /* navigation is best-effort — the user can navigate manually */
      }
    }
    try {
      const r = await this.win.webContents.executeJavaScript(RECORDER_JS, true);
      return r === true ? { ok: true } : { ok: false, error: typeof r === 'string' ? r : 'Không cài được recorder.' };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e) };
    }
  }

  /** Stop re-arming the recorder (keeps captured data + window). */
  stopRecorder(): void {
    this.recorderArmed = false;
  }

  /** Read the in-page recording buffer AND refresh capturedWfPayload (the latest VALID workflow
   *  save request). Returns null if the window is gone. */
  private async pullRecording(): Promise<{ net: J[]; ui: J[] } | null> {
    if (!this.win || this.win.isDestroyed()) return null;
    let r: J = null;
    try {
      r = await this.win.webContents.executeJavaScript('(window.__twWfRec ? { net: window.__twWfRec.net, ui: window.__twWfRec.ui } : null)', true);
    } catch {
      return null;
    }
    if (r && Array.isArray(r.net)) {
      // A valid save = a workflow/automation request whose body carries a real `draft` and that
      // Lark accepted (code 0, or unknown). Take the LAST such — the user's final good state.
      const valid = [...r.net].reverse().find(
        (n: J) => n && n.req && typeof n.req === 'object' && typeof n.req.draft === 'string' && n.req.draft.length > 40 && (n.code === 0 || n.code == null),
      );
      if (valid) this.capturedWfPayload = { baseId: String(valid.req.token || ''), rawBody: valid.req, triggerName: String(valid.req.triggerName || '') };
    }
    return r;
  }

  /** Snapshot of the current recording (for the panel + to export back to the developer). */
  async getRecording(): Promise<{
    netCount: number;
    uiCount: number;
    captured: boolean;
    capturedFields: string[];
    capturedBase: string;
    net: J[];
    ui: J[];
  } | null> {
    const r = await this.pullRecording();
    if (!r) return null;
    const p = this.capturedWfPayload;
    return {
      netCount: (r.net || []).length,
      uiCount: (r.ui || []).length,
      captured: !!p,
      capturedFields: p ? Object.keys((p.rawBody as Record<string, unknown>) || {}) : [],
      capturedBase: p ? p.baseId : '',
      net: (r.net || []).slice(-40),
      ui: (r.ui || []).slice(-120),
    };
  }

  /** Create a REAL workflow by re-sending the exact valid body Lark's own UI produced (captured
   *  by the recorder). This bypasses the internal-schema guessing entirely — the bytes are Lark's.
   *  It clones the last hand-made workflow; parameterising it into arbitrary logic is the next step. */
  async replayCapturedWorkflow(opts?: { enable?: boolean }): Promise<{ workflowID: string; baseId: string; title: string }> {
    await this.pullRecording(); // refresh from the live window first
    const p = this.capturedWfPayload;
    if (!p) throw new Error('Chưa "học" được gói workflow hợp lệ nào. Hãy TẠO TAY 1 workflow trong cửa sổ Lark (hoàn tất + bật) rồi bấm "Lưu bản ghi", sau đó thử lại.');
    const baseId = p.baseId;
    if (!baseId) throw new Error('Không đọc được base từ gói đã học (thiếu token).');
    const created = await this.createWorkflow(baseId, { triggerName: p.triggerName });
    const body = Object.assign({}, p.rawBody as Record<string, unknown>, {
      token: baseId,
      workflowID: created.workflowID,
      status: opts?.enable ? 1 : 0,
    });
    await this.fetchApi('/space/api/bitable/automation/update', 'POST', body);
    let title = '';
    try {
      title = String(JSON.parse(String((p.rawBody as J).draft || '{}'))?.title || '');
    } catch {
      /* title is best-effort */
    }
    return { workflowID: created.workflowID, baseId, title };
  }

  // ── UI-automation DRIVER: the runtime agent READS the live Lark DOM + acts on it. Autonomous for
  //    reading + building a DISABLED draft only — it NEVER enables/deletes (SENSITIVE_UI + the
  //    system-prompt recipe hand those to the human). Truth = the network sniffer, not "I clicked". ──

  /** Start a drive run: (optionally) navigate the Lark page — LARK HOSTS ONLY — and RESET the
   *  per-run action budget. Does NOT pop a window: the user watches live in "Trình duyệt Lark". */
  async uiOpen(
    url?: string,
  ): Promise<{ ok: boolean; url?: string; title?: string; error?: string; detail?: string; hint?: string; blocked?: string; driver?: string }> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (url && !isLarkHost(url)) return { ok: false, error: 'not-lark-host', blocked: 'host-guard', hint: 'Chỉ mở được trang thuộc Lark/Feishu.' };
    if (!this.cdp.startRun()) return { ok: false, error: 'stopped-by-user', blocked: 'user-stop', hint: 'Người dùng vừa bấm DỪNG — không mở lại, báo người dùng đã dừng ở đâu.' };
    this.uiActs = 0;
    if (url && /^https?:\/\//i.test(url)) {
      try {
        await this.win.webContents.loadURL(url, { userAgent: CHROME_UA });
      } catch (e) {
        // Mã máy phải SẠCH (xem larkToolExec.TIER_BY_CODE khớp chính xác) — chi tiết đi trường riêng.
        return { ok: false, error: 'nav-failed', detail: String((e as Error)?.message || e) };
      }
    }
    const driver = (await this.cdp.ensure()) ? 'cdp' : 'legacy';
    try {
      const r = (await this.win.webContents.executeJavaScript('({ url: location.href, title: document.title })', true)) as J;
      const health = driver === 'cdp' ? await this.cdp.health().catch(() => null) : null;
      return {
        ok: true,
        url: r?.url,
        title: r?.title,
        driver,
        ...(health?.blocking ? { blocking: health.blocking, blocking_hint: 'Khung Lark đang có lớp nổi từ trước — xem nó là gì; đóng bằng lark_ui_dismiss nếu là thứ còn sót lại.' } : {}),
        hint: this.win.isEmbedded ? 'Người dùng đang xem trực tiếp trong khung Lark (Lark × Agents → Tạo workflow).' : 'Người dùng có thể mở Lark × Agents → "Tạo workflow" để xem bạn thao tác trực tiếp.',
      };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e) };
    }
  }

  /** Run an in-page UI-driver body (with the TW_UI_LIB helper `L` in scope) and return its JSON. */
  private async runUi(body: string): Promise<J> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'no-window' };
    const js = '(async () => { try { var L = (' + TW_UI_LIB + ')(); ' + body + ' } catch (e) { return { ok:false, error: String((e&&e.message)||e) }; } })()';
    try {
      return (await this.win.webContents.executeJavaScript(js, true)) as J;
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e) };
    }
  }

  /** Agent-readable aria snapshot. CDP (AX tree, all frames incl. cross-origin) first; the legacy
   *  in-page walker only when the debugger can't attach. */
  async uiSnapshot(opts?: { max?: number }): Promise<J> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (this.cdp.isStopped) return this.cdp.snapshot(opts); // → stopped-by-user
    if (await this.cdp.ensure()) {
      this.uiMode = 'cdp';
      return this.cdp.snapshot(opts);
    }
    this.uiMode = 'legacy';
    const max = Math.min(Math.max(Number(opts?.max) || 200, 20), 400);
    const r = await this.runUi(
      "if(!" + LARK_HOST_JS + ".test(location.hostname)) return { ok:false, error:'not-on-lark', url:location.href, hint:'Cửa sổ Lark chưa ở trang Base — dùng lark_ui_open trước.' }; return L.walk(" +
        max +
        ');',
    );
    return { ...r, driver: 'legacy' };
  }

  /** Perform ONE action on a ref from the latest snapshot. Refuses sensitive clicks (enable/delete/
   *  test-run/destructive confirm) — there is NO override from the agent side; capped per run. */
  async uiAct(input: J): Promise<J> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (this.uiMode === 'cdp' && (await this.cdp.ensure())) return this.cdp.act(input);
    if (this.cdp.isStopped) return { ok: false, error: 'stopped-by-user', blocked: 'user-stop' };
    if (!this.cdp.budget.take()) return { ok: false, error: 'budget-exhausted', hint: 'Đã tới giới hạn thao tác phiên này — dừng và báo người dùng.' };
    this.uiActs++;
    const a = {
      ref: Number(input?.ref),
      action: String(input?.action || 'click'),
      value: input?.value != null ? String(input.value) : undefined,
      key: input?.key != null ? String(input.key) : undefined,
      dx: Number(input?.dx) || 0,
      dy: Number(input?.dy) || 0,
      submit: !!input?.submit,
      force: false, // never: a human enables/deletes in Lark
    };
    this.cdp.noteStep(`${a.action} #${a.ref} (legacy)`);
    const body =
      "if(!" + LARK_HOST_JS + ".test(location.hostname)) return { ok:false, error:'not-on-lark' };\n" +
      'var a = ' + JSON.stringify(a) + ';\n' +
      'var SENS = ' + SENSITIVE_UI.toString() + ';\n' +
      UI_ACT_BODY;
    return { ...(await this.runUi(body)), driver: 'legacy' };
  }

  /** Real drag (CDP only) — connect workflow nodes / move cards. */
  async uiDrag(input: J): Promise<J> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (!(await this.cdp.ensure())) return { ok: false, error: 'drag-unsupported', hint: 'Không gắn được trình điều khiển CDP — dùng "Làm mẫu một lần" (ghi tay rồi dùng lại).' };
    return this.cdp.drag(input);
  }

  /** Tự kiểm khung Lark: đang ở đâu, có hộp thoại/lớp che/toast lỗi nào không (CDP). */
  async uiHealth(): Promise<J> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (!(await this.cdp.ensure())) return { ok: false, error: 'cdp-unavailable', hint: 'Không gắn được trình điều khiển CDP.' };
    return this.cdp.health();
  }

  /** Đóng an toàn lớp đang chặn (Escape → nút Thoát/Huỷ/Đóng…; không bao giờ Xoá/Bật/Lưu). */
  async uiDismiss(): Promise<J> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (!(await this.cdp.ensure())) return { ok: false, error: 'cdp-unavailable' };
    return this.cdp.dismiss();
  }

  /**
   * Chạy một đoạn dựng CẤU TRÚC (baseStructure.structureScript) trong trang Base: đưa khung Lark tới
   * đúng Base nếu đang ở chỗ khác, chờ ngữ cảnh Base của trang sẵn sàng, rồi chạy. Không ném — lỗi
   * nằm trong kết quả.
   */
  async runBaseStructure(token: string, script: string): Promise<J> {
    if (!this.win || this.win.isDestroyed() || !this.host) return { ok: false, error: 'Chưa đăng nhập Lark web — đăng nhập trong khung Lark bên phải.' };
    const wc = this.win.webContents;
    const probe = `(() => { try { var a = window.bitableConnectContexts ? Array.from(window.bitableConnectContexts) : []; return a.some(function (c) { try { return c.base.getToken() === ${JSON.stringify(token)} && c.base.isLoaded(); } catch (e) { return false; } }); } catch (e) { return false; } })()`;
    const ready = async () => {
      try {
        return (await Promise.race([wc.executeJavaScript(probe, true), new Promise((r) => setTimeout(() => r(false), 3000))])) === true;
      } catch {
        return false;
      }
    };
    if (!(await ready())) {
      await this.showBase(token);
      const end = Date.now() + 30_000;
      while (Date.now() < end && !(await ready())) await new Promise((r) => setTimeout(r, 700));
      if (!(await ready())) return { ok: false, error: 'base-not-ready', hint: 'Trang Base chưa tải xong trong khung Lark (30 giây) — thử lại, hoặc kiểm tra quyền sửa Base.' };
    }
    try {
      return (await Promise.race([wc.executeJavaScript(script, true), new Promise((r) => setTimeout(() => r({ ok: false, error: 'timeout', hint: 'Lark không trả lời trong 60 giây.' }), 60_000))])) as J;
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e) };
    }
  }

  /** What Lark ACTUALLY saved during this run (automation/workflow write requests + responses). */
  uiSaved(): J {
    const st = this.cdp.status();
    const valid = this.cdp.lastValidSave();
    return {
      ok: true,
      saves: st.saves,
      lastValidSave: valid ? { endpoint: valid.endpoint, at: new Date(valid.at).toISOString(), workflowID: String(valid.body.workflowID || ''), status: valid.body.status, base: String(valid.body.token || '') } : null,
      hint: st.saves.length ? 'Báo người dùng workflowID + code Lark trả về (ok=true khi code=0). Bản nháp đang TẮT — họ tự mở Lark xem lại và bật.' : 'Chưa thấy Lark lưu gì trong lượt này — chưa có bản nháp nào được tạo.',
    };
  }

  /** Wait: text / role+name / network-idle (CDP), or the legacy fixed sleep / selector-stable. */
  async uiWait(input?: { ms?: number; text?: string; selector?: string; stableMs?: number; role?: string; name?: string; network_idle?: boolean; idle_ms?: number; timeout_ms?: number }): Promise<J> {
    if (!input?.selector && (await this.cdp.ensure())) return this.cdp.wait(input || {});
    if (this.cdp.isStopped) return { ok: false, error: 'stopped-by-user', blocked: 'user-stop' };
    const a = {
      ms: Math.min(Math.max(Number(input?.ms ?? input?.timeout_ms) || 800, 0), 20000),
      text: input?.text ? String(input.text) : undefined,
      selector: input?.selector ? String(input.selector) : undefined,
      stableMs: Math.min(Math.max(Number(input?.stableMs) || 400, 100), 5000),
    };
    const body =
      'var a = ' + JSON.stringify(a) + ';\n' +
      'var _end = Date.now() + a.ms;\n' +
      "if(a.text){ return await new Promise(function(res){ function chk(){ var ok=((document.body&&document.body.innerText)||'').indexOf(a.text)>=0; if(ok||Date.now()>_end) return res({ ok:true, resolved:ok, reason: ok?'found':'timeout' }); setTimeout(chk,150); } chk(); }); }\n" +
      "if(a.selector){ return await new Promise(function(res){ var last=-1, since=Date.now(); function chk(){ var n=0; try{ n=document.querySelectorAll(a.selector).length; }catch(e){} if(n!==last){ last=n; since=Date.now(); } if((Date.now()-since)>=a.stableMs) return res({ ok:true, resolved:true, reason:'stable', count:n }); if(Date.now()>_end) return res({ ok:true, resolved:false, reason:'timeout', count:n }); setTimeout(chk,120); } chk(); }); }\n" +
      "return await new Promise(function(res){ setTimeout(function(){ res({ ok:true, resolved:true, reason:'slept', waitedMs:a.ms }); }, a.ms); });";
    return this.runUi(body);
  }

  // ── "Trình duyệt Lark" screen: embed the SAME page inside the main window ───────────────────

  /** Register the main window as the place the Lark page parks (off-screen, still painting). */
  setParkingWindow(win: BrowserWindow | null): void {
    this.parkingWin = win;
    if (this.win && !this.win.isDestroyed()) this.win.setParking(win);
    win?.once('closed', () => {
      if (this.parkingWin === win) this.parkingWin = null;
    });
  }

  /** Attach (or re-position) the Lark page inside `win`. Zero-size rect = attached but hidden. */
  browserAttach(win: BrowserWindow, rect: { x: number; y: number; width: number; height: number }): LarkBrowserState {
    this.embedTarget = { win, rect };
    if (this.win && !this.win.isDestroyed()) {
      this.win.embed(win, rect);
      void this.cdp.ensure(); // network capture on → a hand-made automation becomes a template
    }
    return this.browserState();
  }

  /** Leave the screen: the page goes back to the hidden host (session + automation keep running). */
  browserDetach(): void {
    this.embedTarget = null;
    if (this.win && !this.win.isDestroyed()) {
      this.win.unembed();
      // A login was in progress inside the app → keep it reachable as the classic popup.
      if (this.loginPending) this.win.show();
    }
  }

  private viewLoginProbing = false;
  private viewLoginProbeAt = 0;

  /**
   * Người dùng có thể đăng nhập Lark ngay trong khung Trình duyệt Lark mà không bấm "Đăng nhập Lark"
   * — khi đó không có vòng chờ connect() nào đang chạy để nhận ra. Màn hình hỏi trạng thái định kỳ,
   * nên mỗi lần hỏi (thưa, có hạn giờ) cũng kiểm luôn: Lark đã xác nhận người dùng thật chưa.
   */
  private maybeDetectViewLogin(wc: Electron.WebContents | undefined): void {
    if (this.host || !wc || this.viewLoginProbing) return;
    if (Date.now() - this.viewLoginProbeAt < VIEW_LOGIN_PROBE_MS) return;
    let url = '';
    try {
      url = wc.getURL();
    } catch {
      return;
    }
    if (!canProbeLogin(url)) return;
    this.viewLoginProbing = true;
    this.viewLoginProbeAt = Date.now();
    void this.isRealLogin(url)
      .then((origin) => {
        if (!origin || this.host) return;
        this.host = origin;
        this.lastHealth = 'alive';
        this.recordRelogin('local', 'success');
      })
      .finally(() => {
        this.viewLoginProbing = false;
      });
  }

  browserState(): LarkBrowserState {
    const w = this.win && !this.win.isDestroyed() ? this.win : null;
    const wc = w?.webContents;
    this.maybeDetectViewLogin(wc);
    let url = '';
    let title = '';
    let canGoBack = false;
    let canGoForward = false;
    let loading = false;
    try {
      if (wc) {
        url = wc.getURL();
        title = wc.getTitle();
        canGoBack = wc.navigationHistory?.canGoBack?.() ?? false;
        canGoForward = wc.navigationHistory?.canGoForward?.() ?? false;
        loading = wc.isLoading();
      }
    } catch {
      /* destroyed mid-read */
    }
    const st = this.status();
    const ai = this.cdp.status();
    const valid = this.cdp.lastValidSave() || (this.capturedWfPayload ? { endpoint: '/space/api/bitable/automation/update', body: this.capturedWfPayload.rawBody as Record<string, unknown>, at: 0 } : null);
    let capturedTitle = '';
    try {
      capturedTitle = valid ? String(JSON.parse(String(valid.body.draft || '{}'))?.title || '') : '';
    } catch {
      /* best-effort */
    }
    return {
      connected: st.connected,
      health: this.lastHealth,
      host: st.host,
      hasWindow: !!w,
      loginPending: this.loginPending,
      embedded: !!w?.isEmbedded,
      url,
      title,
      canGoBack,
      canGoForward,
      loading,
      driver: this.cdp.attached ? 'cdp' : w ? 'legacy' : 'none',
      hidden: hiddenMode(),
      ai: { active: ai.active, stopped: ai.stopped, step: ai.step, actions: ai.actions, cap: ai.cap, startedAt: ai.startedAt, lastAt: ai.lastAt, saves: ai.saves },
      capturedSave: valid ? { endpoint: valid.endpoint, base: String(valid.body.token || ''), title: capturedTitle || undefined, fields: Object.keys(valid.body) } : undefined,
    };
  }

  /** Toolbar navigation. Pasted URLs must be Lark hosts (this page holds the user's Lark login). */
  async browserNavigate(input: { url?: string; action?: 'back' | 'forward' | 'reload' | 'home' | 'stop' }): Promise<LarkBrowserState> {
    const w = this.win && !this.win.isDestroyed() ? this.win : null;
    if (!w) throw new Error('Chưa có phiên Lark web — bấm "Đăng nhập Lark" trước.');
    const wc = w.webContents;
    if (input.url) {
      const u = /^https?:\/\//i.test(input.url) ? input.url : 'https://' + input.url;
      if (!isLarkHost(u)) throw new Error('Chỉ mở được địa chỉ thuộc Lark/Feishu (…larksuite.com, …feishu.cn).');
      await wc.loadURL(u, { userAgent: CHROME_UA }).catch(() => undefined);
    } else if (input.action === 'back') wc.navigationHistory?.goBack?.();
    else if (input.action === 'forward') wc.navigationHistory?.goForward?.();
    else if (input.action === 'reload') wc.reload();
    else if (input.action === 'stop') wc.stop();
    else if (input.action === 'home') await wc.loadURL((this.host || 'https://www.larksuite.com') + '/', { userAgent: CHROME_UA }).catch(() => undefined);
    return this.browserState();
  }

  /** "Dừng" — abort the running UI automation (every lark_ui_* call refuses until it's lifted). */
  browserStopAi(): LarkBrowserState {
    this.cdp.stop();
    return this.browserState();
  }
  browserResumeAi(): LarkBrowserState {
    this.cdp.resume();
    return this.browserState();
  }

  // ── Templates: "Làm mẫu một lần → dùng lại" ──────────────────────────────────────────────────

  private templatesFile(): string {
    return join(app.getPath('userData'), `lark-ui-templates-${this.scope}.json`);
  }

  templateList(): LarkUiTemplate[] {
    return loadTemplates(this.templatesFile()).map(templateSummary) as LarkUiTemplate[];
  }

  /** Save the latest VALID automation save the user made by hand (CDP capture, else the legacy
   *  in-page recorder) as a named template. */
  async templateSave(input: { name: string; description?: string }): Promise<LarkUiTemplate> {
    await this.pullRecording().catch(() => null);
    const valid = this.cdp.lastValidSave() || (this.capturedWfPayload ? { endpoint: '/space/api/bitable/automation/update', body: this.capturedWfPayload.rawBody as Record<string, unknown>, at: 0 } : null);
    if (!valid) throw new Error('Chưa bắt được lần LƯU automation/workflow nào. Hãy dựng 1 cái bằng tay trong khung Lark của màn "Tạo workflow" (bấm Lưu trong Lark), rồi thử lại.');
    const tpl = extractTemplate(valid.body, { name: input.name, description: input.description, endpoint: valid.endpoint });
    const list = loadTemplates(this.templatesFile());
    list.unshift(tpl);
    saveTemplates(this.templatesFile(), list);
    return templateSummary(tpl) as LarkUiTemplate;
  }

  templateDelete(id: string): LarkUiTemplate[] {
    const list = loadTemplates(this.templatesFile()).filter((t) => t.id !== id);
    saveTemplates(this.templatesFile(), list);
    return list.map(templateSummary) as LarkUiTemplate[];
  }

  /**
   * Replay a template as a NEW DISABLED draft: fill variables → create a fresh shell → POST Lark's
   * own captured body shape with status 0. Never enables (the human reviews + enables in Lark).
   */
  async templateApply(input: { id: string; baseId?: string; vars?: Record<string, string>; title?: string }): Promise<LarkUiTemplateApplyResult> {
    const tpl = loadTemplates(this.templatesFile()).find((t) => t.id === input.id) as UiTemplate | undefined;
    if (!tpl) throw new Error('Không tìm thấy mẫu.');
    const baseId = String(input.baseId || tpl.sourceBase || '').trim();
    if (!baseId || !SAFE_ID.test(baseId)) throw new Error('Thiếu base đích (app_token).');
    const { body, missing } = fillTemplate(tpl, input.vars || {}, baseId);
    if (missing.length) {
      return { ok: false, missing, baseId, error: 'Base khác base gốc — phải điền id bảng/cột/view/option mới cho: ' + missing.join(', ') };
    }
    const endpoint = /^\/(space\/api|base\/api)\//.test(tpl.endpoint) ? tpl.endpoint : '/space/api/bitable/automation/update';
    if (input.title && typeof body.draft === 'string') {
      try {
        const d = JSON.parse(body.draft);
        d.title = String(input.title).slice(0, 120);
        body.draft = JSON.stringify(d);
      } catch {
        /* keep Lark's draft as-is */
      }
    }
    const created = await this.createWorkflow(baseId, { triggerName: tpl.triggerName, source: tpl.source, bizType: tpl.bizType });
    const final = Object.assign({}, body, { token: baseId, workflowID: created.workflowID, status: 0 });
    await this.fetchApi(endpoint, 'POST', final); // throws on Lark code ≠ 0
    let title = '';
    try {
      title = String(JSON.parse(String(final.draft || '{}'))?.title || '');
    } catch {
      /* best-effort */
    }
    return { ok: true, workflowID: created.workflowID, baseId, status: 0, code: 0, title: title || undefined };
  }

  /**
   * Inspect a Lark aPaaS App page (`/app/<id>?pageId=…`) for LOADING errors + functionality — a
   * READ-ONLY health probe the Open API cannot do (aPaaS pages aren't in the Open API; a plain DOM
   * snapshot can't see soft errors). Navigates the hidden logged-in window there, arms two capture
   * layers (main-process console/load-fail + in-page error/network hook), lets the SPA settle, then
   * collects a classified report: status (ok | empty | stuck | error | nav-failed), the error
   * banner text the user sees, failed requests (4xx/5xx or Lark soft `code≠0`), and the rendered
   * control surface. No clicks — functionality = render + control-existence, not deep behaviour.
   */
  async appInspect(url: string, opts?: { settleMs?: number; tab?: string }): Promise<J> {
    if (!this.win || this.win.isDestroyed()) return { ok: false, error: 'no-window' };
    if (!url || !/^https?:\/\//i.test(url)) return { ok: false, error: 'Cần URL đầy đủ của trang Lark App (https://…/app/…?pageId=…).' };
    // Arm BEFORE navigating so did-finish-load re-injects the hook + main-process listeners fire.
    this.inspectArmed = true;
    this.inspectLog = { consoleErrors: [], failedLoads: [] };
    const opened = await this.uiOpen(url);
    if (!opened.ok) {
      this.inspectArmed = false;
      return { ok: false, status: 'nav-failed', error: opened.error, url };
    }
    // Frames spawn slightly after nav (embedded Bitables load late) — beat, then inject the health
    // hook into EVERY frame (main + cross-origin embedded) so their errors are captured too.
    await new Promise((r) => setTimeout(r, 900));
    for (const f of this.allFrames()) {
      try {
        await f.executeJavaScript(APP_HEALTH_HOOK, true);
      } catch {
        /* frame may be cross-origin-restricted or gone */
      }
    }
    const settle = Math.min(Math.max(Number(opts?.settleMs) || 3500, 800), 12000);
    await new Promise((r) => setTimeout(r, settle));
    // A Lark page's tabs ("Trang Tổng Hợp / Dữ Liệu Vận Đơn / …") are CLIENT-SIDE sub-nav (the
    // pageId doesn't deep-link) AND may live inside an EMBEDDED BITABLE iframe. Search every frame,
    // click in the first that has the tab, then let its content + data fetches settle.
    let tabClicked: string | null = null;
    if (opts?.tab) {
      const want = String(opts.tab);
      const clickBody =
        'var want = ' + JSON.stringify(want.toLowerCase()) + ';\n' +
        'var els = []; try { els = document.querySelectorAll("*"); } catch(e){}\n' +
        'var best=null;\n' +
        'for (var i=0;i<els.length;i++){ var el=els[i]; if(!L.interactive(el)||!L.isVisible(el)) continue; var nm=L.accName(el); if(!nm) continue; var low=nm.toLowerCase(); if(low===want || low.indexOf(want)>=0){ var rl=L.role(el); var score=(rl==="tab"?3:((rl==="button"||rl==="link")?2:1)) - Math.abs(low.length-want.length)*0.02; if(!best||score>best.score){ best={el:el,name:nm,score:score}; } } }\n' +
        'if(!best) return { ok:true, clicked:false };\n' +
        'try{ best.el.scrollIntoView({block:"center"}); }catch(e){}\n' +
        'var r=best.el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;\n' +
        'L.fireMouse(best.el,"pointerover",x,y); L.fireMouse(best.el,"mousedown",x,y,true); L.fireMouse(best.el,"pointerdown",x,y,true); L.fireMouse(best.el,"pointerup",x,y); L.fireMouse(best.el,"mouseup",x,y); if(typeof best.el.click==="function") best.el.click();\n' +
        'return { ok:true, clicked:true, name:best.name };';
      for (const f of this.allFrames()) {
        const cr = await this.frameEval(f, clickBody);
        if (cr?.clicked) {
          tabClicked = String(cr.name || want);
          break;
        }
      }
      if (tabClicked) await new Promise((r) => setTimeout(r, 2400));
    }
    // Collect health from EVERY frame, then aggregate (frame 0 = main; the rest are embedded).
    const frameResults: { url: string; res: J }[] = [];
    const frameList = this.allFrames();
    for (const f of frameList) {
      let furl = '';
      try {
        furl = f.url;
      } catch {
        /* gone */
      }
      const res = await this.frameEval(f, APP_HEALTH_COLLECT);
      if (res && res.ok !== false) frameResults.push({ url: furl, res });
    }
    const mainErrs = this.inspectLog.consoleErrors.slice(-12);
    const failedLoads = this.inspectLog.failedLoads;
    this.inspectArmed = false;
    if (!frameResults.length) {
      return { ok: false, status: 'error', url, error: 'collect-failed', consoleErrors: mainErrs, failedLoads };
    }
    const controls: J[] = [];
    const bannerTexts: string[] = [];
    const failedRequests: J[] = [];
    let inPageConsole: J[] = [];
    const blockers: J[] = [];
    const frames: J[] = [];
    let anyRootFilled = false;
    let anySpinner = false;
    frameResults.forEach((fr, idx) => {
      const r = fr.res;
      const embedded = idx > 0; // frame 0 is the main document
      for (const c of r.controls || []) controls.push(embedded && fr.url ? { ...c, frame: fr.url.slice(0, 80) } : c);
      for (const b of r.bannerTexts || []) if (bannerTexts.indexOf(b) < 0) bannerTexts.push(b);
      for (const fq of r.failedRequests || []) failedRequests.push(fq);
      inPageConsole = inPageConsole.concat(r.consoleErrors || []);
      for (const bl of r.blockers || []) blockers.push(bl);
      if (r.rootFilled) anyRootFilled = true;
      if (r.spinnerVisible) anySpinner = true;
      frames.push({ url: fr.url.slice(0, 100), status: r.status, controlCount: r.controlCount, rootFilled: !!r.rootFilled });
    });
    const consoleErrors = [...inPageConsole, ...mainErrs].slice(-20);
    // Embedded-block failures surface as console record/chart errors (e.g. Lark "Record error",
    // "getChartId error") — treat those as an error even without an HTTP 4xx/banner.
    const embeddedErr = consoleErrors.some((c) => /record error|getchartid|error occur|加载失败|load.*fail/i.test(String(c)));
    let status = 'ok';
    if (bannerTexts.length || failedRequests.length || failedLoads.length || embeddedErr) status = 'error';
    else if (anySpinner && !anyRootFilled) status = 'stuck';
    else if (!anyRootFilled && controls.length === 0 && blockers.length === 0) status = 'empty';
    return {
      ok: true,
      status,
      url: opened.url || url,
      title: frameResults[0]?.res?.title,
      frameCount: frameList.length,
      frames,
      tabRequested: opts?.tab || undefined,
      tabClicked,
      ...(opts?.tab && !tabClicked
        ? { tabNote: 'Không tìm thấy tab tên "' + opts.tab + '" trong bất kỳ frame nào — có thể tên khác hoặc khối nhúng chưa tải xong. Xem controls.' }
        : {}),
      spinnerVisible: anySpinner,
      rootFilled: anyRootFilled,
      bannerTexts,
      consoleErrors,
      failedRequests: failedRequests.slice(-20),
      failedLoads,
      controlCount: controls.length,
      blockers,
      controls: controls.slice(0, 80),
      controlsText: controls
        .slice(0, 80)
        .map((c) => '#' + c.ref + ' ' + c.role + ' "' + c.name + '"' + (c.frame ? ' @' + c.frame : ''))
        .join('\n'),
    };
  }

  /** All frames (main + subframes, incl. cross-origin embedded Bitables). The MAIN PROCESS can run
   *  JS in any of them via WebFrameMain — bypassing the same-origin wall that blocks top-frame JS —
   *  so appInspect can read/click inside an embedded Base the page snapshot can't reach. */
  private allFrames(): import('electron').WebFrameMain[] {
    try {
      const mf = this.win?.webContents.mainFrame;
      if (!mf) return [];
      return mf.framesInSubtree.filter((f) => {
        try {
          return !!(f && f.url);
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  /** Run a TW_UI_LIB body (L in scope) inside a specific frame; never throws. */
  private async frameEval(f: import('electron').WebFrameMain, body: string): Promise<J> {
    const wrapped = '(async () => { try { var L = (' + TW_UI_LIB + ')(); ' + body + ' } catch (e) { return { ok:false, error: String((e&&e.message)||e) }; } })()';
    try {
      return (await f.executeJavaScript(wrapped, true)) as J;
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e) };
    }
  }

  /**
   * Phone-initiated re-login: open the Lark login window HEADLESS, stream a screenshot of it
   * (the QR/login page) via `onQr` every couple seconds, and poll for a successful login. On
   * success the cookies land in this partition (getConnectorSession() is fresh) → the caller
   * refreshes the CMS jobs. Resolves 'success' | 'timeout' | 'failed'.
   */
  async phoneLogin(onQr: (dataUrl: string) => void): Promise<'success' | 'timeout' | 'failed'> {
    const origin = this.host || 'https://www.larksuite.com';
    this.destroyWindow();
    const win = this.makeWindow(false); // hidden — captured via webContents.capturePage()
    this.win = win;
    try {
      await win.loadURL(origin, { userAgent: CHROME_UA });
    } catch {
      this.recordRelogin('remote', 'failed');
      return 'failed';
    }
    const start = Date.now();
    let cleared = false; // wipe stale cookies at most once, to force a real login QR
    let probing = false; // don't overlap probeHealth() calls across ticks
    return new Promise<'success' | 'timeout' | 'failed'>((resolve) => {
      let settled = false;
      const finish = (r: 'success' | 'timeout' | 'failed') => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        this.recordRelogin('remote', r);
        resolve(r);
      };
      const poll = setInterval(async () => {
        if (!win || win.isDestroyed()) return finish('failed');
        let url = '';
        try {
          url = win.webContents.getURL();
        } catch {
          return;
        }
        const onLarkApp = !!url && classifyLarkPage(url) === 'app';
        if (onLarkApp && !probing) {
          // The URL LOOKS logged-in — but a STALE session also lands here. probeHealth asks Lark
          // "who am I" (anonymous ⇒ dead) before declaring success; the old code trusted the URL.
          this.host = safeOrigin(url);
          probing = true;
          const health = await this.probeHealth().catch(() => 'unknown' as const);
          probing = false;
          if (health === 'alive') {
            this.lastHealth = 'alive';
            this.host = (await this.isRealLogin(url).catch(() => null)) || this.host;
            try {
              win.hide();
            } catch {
              /* ignore */
            }
            return finish('success');
          }
          if (health === 'dead' && !cleared) {
            // Session really is dead → wipe the partition cookies + reload so Lark shows the LOGIN
            // page (QR), instead of the SPA shell that faked a logged-in URL.
            cleared = true;
            try {
              await session.fromPartition(this.partitionName()).clearStorageData();
            } catch {
              /* ignore */
            }
            try {
              await win.loadURL(origin, { userAgent: CHROME_UA });
            } catch {
              /* ignore */
            }
            return; // subsequent ticks are on the login page → stream the QR below
          }
          // 'unknown' (transient) → keep polling; never declare success on an unverified session.
        }
        // On the login page (or an unverified app shell) → stream a fresh screenshot to scan.
        try {
          const img = await win.webContents.capturePage();
          onQr(img.resize({ width: 720 }).toDataURL());
        } catch {
          /* capture is best-effort */
        }
        if (Date.now() - start > 300_000) finish('timeout');
      }, 2500);
    });
  }

  disconnect(): void {
    this.destroyWindow();
    this.host = null;
    // Wipe the persisted cookies/storage for this partition.
    session.fromPartition(this.partitionName()).clearStorageData().catch(() => undefined);
  }

  private clearTimers(): void {
    if (this.poll) clearInterval(this.poll);
    if (this.timer) clearTimeout(this.timer);
    this.poll = null;
    this.timer = null;
  }

  private destroyWindow(): void {
    this.clearTimers(); // stop any in-flight connect() poll/timeout so it can't leak
    this.recorderArmed = false; // a fresh window has no in-page recorder until re-armed
    this.inspectArmed = false;
    this.loginPending = false;
    this.cdp.bind(null);
    if (this.win && !this.win.isDestroyed()) {
      try {
        this.win.destroy();
      } catch {
        /* ignore */
      }
    }
    this.win = null;
  }

  /**
   * Call a SAME-ORIGIN Lark internal endpoint from inside the logged-in window. `path` is a
   * root-relative path (e.g. `/space/api/bitable/…`). Returns the parsed `data` on Lark
   * `code === 0`; throws an actionable error on a login redirect / non-zero code.
   */
  private async rawCall(path: string, method: string, body?: unknown): Promise<RawResult> {
    if (!this.win || this.win.isDestroyed()) return { error: 'Cửa sổ Lark đã đóng' };
    // x-csrftoken cho MỌI phương thức (đúng như app Lark gửi) — xem pageFetchJs.
    const js = pageFetchJs(path, method, body);
    return (await this.win!.webContents.executeJavaScript(js, true)) as RawResult;
  }

  async fetchApi<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.win || this.win.isDestroyed() || !this.host) {
      throw new Error('Chưa kết nối Lark web (thử nghiệm). Vào Cài đặt → "Kết nối Lark web" để đăng nhập.');
    }
    const res = await this.rawCall(path, method, body);
    if (res?.error) throw new Error(`Lỗi gọi API nội bộ Lark: ${res.error} (trang: ${res.pageUrl || this.host})`);
    if (!res?.json) {
      const snip = (res?.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const looksLogin = /login|passport|sign\s?in|đăng nhập|log in/i.test(res?.snippet || '') || /\/(accounts|passport|login|sso)/i.test(res?.finalUrl || '');
      if (looksLogin) {
        this.reveal();
        this.markDead();
      }
      const where = `máy chủ cửa sổ = ${res?.pageUrl || this.host}`;
      throw new Error(
        looksLogin
          ? `Chưa đăng nhập ở ĐÚNG máy chủ. ${where}. Hãy Kết nối lại bằng URL Base CỦA BẠN rồi đăng nhập. (HTTP ${res?.status ?? '?'})`
          : `API nội bộ trả về không phải JSON (HTTP ${res?.status ?? '?'}). ${where}. Có thể sai máy chủ hoặc base_id. Trích: "${snip}"`,
      );
    }
    const j = res.json as { code?: number; msg?: string; data?: T };
    if (j.code !== undefined && j.code !== 0) throw new Error(`Lark (nội bộ) báo lỗi ${j.code}: ${j.msg || 'không rõ'}`);
    return j.data as T;
  }

  /**
   * Trigger Lark's INTERNAL Bitable connector sync for one table — the exact call the browser
   * extension captured, but run SAME-ORIGIN inside the logged-in window (rawCall attaches the live
   * cookies + the matching x-csrftoken automatically, and does NOT send docs-host-id — matching the
   * working request). Unlike the CMS backend, this REPORTS the real Lark result: `code:0` = queued,
   * a "syncing" message = already-in-progress (treated as ok), anything else THROWS with the real
   * code so a wrong docToken / expired session is finally visible.
   */
  async syncConnectorTable(
    docToken: string,
    tableID: string,
    hostId?: string,
    hostType?: string,
    domain?: string,
  ): Promise<{ ok: boolean; skipped?: boolean; code?: number; msg?: string; raw?: string }> {
    if (!this.win || this.win.isDestroyed() || !this.host) {
      throw new Error('Chưa kết nối Lark web — vào Cài đặt → "Kết nối Lark web" để đăng nhập.');
    }
    // The base's connector lives on a SPECIFIC tenant shard (e.g. lsgav2gopb4m.sg.larksuite.com).
    // The fetch below uses a relative path, so it runs on the WINDOW's current origin — if that's a
    // different host (e.g. www.larksuite.com after a generic login) the session cookies + CSRF for
    // the base's shard aren't present → the sync silently fails. So navigate the window onto the
    // base's own shard first (same session, cookies apply), then fetch same-origin.
    if (domain) {
      const targetOrigin = `https://${domain}`;
      let cur = '';
      try {
        cur = this.win.webContents.getURL();
      } catch {
        /* ignore */
      }
      if (!cur || safeOrigin(cur) !== targetOrigin) {
        try {
          await this.win.loadURL(`${targetOrigin}/`, { userAgent: CHROME_UA });
          await new Promise((r) => setTimeout(r, 1800)); // let the SPA + cookies settle
        } catch {
          /* if navigation fails, fall through and let the fetch report the real error */
        }
      }
    }
    // Build the request INSIDE the logged-in window (same-origin → cookies + origin/referer are
    // attached by the browser). We add the docs-host headers a WIKI-hosted base requires — this is
    // what the real captured request sends (docs-host-id = the wiki node token, docs-host-type=Wiki);
    // omitting them makes Lark silently reject the sync.
    const js = `(async () => {
      try {
        var m = document.cookie.match(/(?:^|; )_csrf_token=([^;]+)/);
        var csrf = m ? decodeURIComponent(m[1]) : '';
        var headers = {
          'accept': 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'x-csrftoken': csrf,
          'doc-biz': 'Lark',
          'doc-os': 'mac',
          'doc-platform': 'web',
          'docs-host-type': ${JSON.stringify(hostType || 'Wiki')}
        };
        ${hostId ? `headers['docs-host-id'] = ${JSON.stringify(hostId)};` : ''}
        var r = await fetch('/space/api/bitable/connector/sync', {
          method: 'POST', credentials: 'include', headers: headers,
          body: JSON.stringify({ token: ${JSON.stringify(docToken)}, tableID: ${JSON.stringify(tableID)} })
        });
        var text = await r.text();
        var json = null; try { json = JSON.parse(text); } catch (e) {}
        return { status: r.status, json: json, snippet: json ? null : text.slice(0, 300), finalUrl: r.url, pageUrl: location.href };
      } catch (e) { return { error: String((e && e.message) || e), pageUrl: location.href }; }
    })()`;
    const res = (await this.win.webContents.executeJavaScript(js, true)) as RawResult;
    const where = `origin cửa sổ = ${res?.pageUrl || this.host}`;
    if (res?.error) throw new Error(`Lỗi gọi connector/sync: ${res.error} (${where})`);
    if (!res?.json) {
      const looksLogin =
        /login|passport|sign\s?in|đăng nhập|log in/i.test(res?.snippet || '') ||
        /\/(accounts|passport|login|sso)/i.test(res?.finalUrl || '');
      if (looksLogin) {
        this.reveal();
        this.markDead();
        throw new Error(`Phiên Lark web đã hết hạn — bấm "Đăng nhập lại Lark web" (HTTP ${res?.status ?? '?'}, ${where}).`);
      }
      const snip = (res?.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      throw new Error(`connector/sync trả về không phải JSON (HTTP ${res?.status ?? '?'}, ${where}). Trích: "${snip}"`);
    }
    const j = res.json as { code?: number; msg?: string; data?: unknown };
    const code = j.code ?? 0;
    const low = (j.msg || '').toLowerCase();
    const syncing = /syncing|is syncing/.test(low);
    // Return the REAL code/msg instead of throwing on a non-zero code, so the UI can show exactly
    // what Lark said (a "success" HTTP with a non-zero code that no-ops is the classic silent fail).
    return {
      ok: code === 0 || syncing,
      skipped: syncing,
      code,
      msg: j.msg || (code === 0 ? 'OK' : ''),
      raw: JSON.stringify(j).slice(0, 400),
    };
  }

  // ── Lớp dữ liệu web (KHÔNG cần App ID/App Secret) — xem larkWebApi.ts + docs/lark-web-api.md ──

  /**
   * Gọi một API nội bộ CÙNG ORIGIN trong trang Lark đang đăng nhập, gắn `x-csrftoken` cho MỌI
   * phương thức (recent/list thiếu nó là HTTP 500, tablesv3 là 403). Có hạn giờ: executeJavaScript
   * treo vô hạn khi trang đang chuyển hướng. Trả nguyên JSON (kể cả code ≠ 0) để parser quyết định.
   */
  async webJson(path: string, method = 'GET', body?: unknown, timeoutMs = 25_000): Promise<J> {
    if (!this.win || this.win.isDestroyed() || !this.host) {
      throw new Error('Chưa đăng nhập Lark web — mở "Tạo workflow" và đăng nhập Lark ngay trong khung bên phải.');
    }
    const wc = this.win.webContents;
    // Fetch tương đối chạy theo origin HIỆN TẠI của trang. Trang lạc sang origin khác (trang đăng
    // nhập, www.larksuite.com) thì cookie/csrf của tenant không áp → đưa về đúng tenant trước.
    let cur = '';
    try {
      cur = wc.getURL();
    } catch {
      /* ignore */
    }
    if (safeOrigin(cur) !== safeOrigin(this.host)) {
      try {
        await this.win.loadURL(`${this.host}/drive/home/`, { userAgent: CHROME_UA });
        await new Promise((r) => setTimeout(r, 1500));
      } catch {
        /* để fetch bên dưới báo lỗi thật */
      }
    }
    const run = wc.executeJavaScript(pageFetchJs(path, method, body), true) as Promise<RawResult>;
    const res = await Promise.race([
      run.catch((e) => ({ error: String((e as Error)?.message || e) }) as RawResult),
      new Promise<RawResult>((r) => setTimeout(() => r({ error: `quá ${Math.round(timeoutMs / 1000)}s không trả lời` }), timeoutMs)),
    ]);
    if (res?.error) throw new Error(`Lỗi gọi Lark web (${path.split('?')[0]}): ${res.error}`);
    if (!res?.json) {
      const looksLogin = /login|passport|sign\s?in|đăng nhập|log in/i.test(res?.snippet || '') || LOGIN_MARKERS.test(res?.finalUrl || '');
      if (looksLogin) {
        this.markDead();
        throw new Error('Phiên Lark web đã hết — bấm "Đăng nhập lại" ở khung Lark bên phải.');
      }
      throw new Error(`Lark web trả về không phải JSON (HTTP ${res?.status ?? '?'}, ${path.split('?')[0]}).`);
    }
    return res.json;
  }

  /** Người đang đăng nhập Lark web (id dùng cho "gửi cho tôi" trong automation). */
  async webMe(): Promise<{ id: string; name: string; avatarUrl?: string; tenant?: string } | null> {
    try {
      const j = await this.webJson(WHOAMI_PATH);
      const d = j?.data;
      if (!d || d.is_Anonymous) return null;
      const id = String(d.suid || d.id || d.uid || '');
      return id ? { id, name: String(d.name || d.cn_name || ''), avatarUrl: d.avatar_url ? String(d.avatar_url) : undefined, tenant: d.tenant_name ? String(d.tenant_name) : undefined } : null;
    } catch {
      return null;
    }
  }

  /**
   * TẤT CẢ Base người dùng thấy: duyệt hết các trang recent/list (obj_type 8 — đã gồm Base trong
   * Wiki) rồi, nếu có `query`, gộp thêm kết quả ô tìm kiếm của Drive (để ra cả Base lâu chưa mở).
   */
  async listWebBases(opts: { query?: string; maxPages?: number } = {}): Promise<WebBase[]> {
    const lists: WebBase[][] = [];
    let label: string | undefined;
    for (let page = 0; page < (opts.maxPages ?? 12); page++) {
      const r = parseRecentList(await this.webJson(recentListPath({ types: [OBJ_BITABLE], lastLabel: label })));
      lists.push(r.bases);
      if (!r.hasMore || !r.lastLabel || r.lastLabel === label) break;
      label = r.lastLabel;
    }
    const q = (opts.query || '').trim();
    let all = mergeBases(...lists);
    if (q) {
      const found = parseSearch(await this.webJson(searchPath(q))).bases;
      const norm = (s: string) => s.toLowerCase();
      all = mergeBases(found, all.filter((b) => norm(b.name).includes(norm(q))));
    }
    return all;
  }

  /**
   * Quét một Base CHỈ ĐỌC: tên + bảng (cột/kiểu/lựa chọn/view + vài bản ghi mẫu) + automation và
   * workflow đã có. Một GET clientvars cho mỗi bảng (recordLimit nhỏ) — không cần quyền App.
   */
  async scanWebBase(token: string, opts: { maxTables?: number; samples?: number } = {}): Promise<{
    meta: WebBaseMeta;
    tables: WebTable[];
    automations: WebAutomation[];
    workflows: WebAutomation[];
    errors: string[];
  }> {
    const samples = Math.max(0, Math.min(5, opts.samples ?? 3));
    const first = await this.webJson(clientVarsPath(token, undefined, samples));
    if (first?.code !== 0) throw new Error(`Không đọc được Base (Lark báo ${first?.code}: ${first?.msg || ''}). Kiểm tra bạn có quyền xem Base này.`);
    const meta = parseBaseMeta(decodeLarkGz(first.data?.base));
    const names: Record<string, string> = Object.fromEntries(meta.tables.map((t) => [t.id, t.name]));
    const tables: WebTable[] = [];
    const errors: string[] = [];
    const firstTable = first.data?.table ? decodeLarkGz(first.data.table) : null;
    for (const t of meta.tables.slice(0, opts.maxTables ?? 20)) {
      try {
        let raw = firstTable && firstTable.meta?.id === t.id ? firstTable : null;
        if (!raw) {
          const j = await this.webJson(clientVarsPath(token, t.id, samples));
          if (j?.code !== 0) throw new Error(`${j?.code}: ${j?.msg || ''}`);
          raw = decodeLarkGz(j.data?.table);
        }
        tables.push(parseTableSchema(raw, t.name, samples));
      } catch (e) {
        errors.push(`Bảng «${t.name}»: ${(e as Error)?.message || e}`);
      }
    }
    let automations: WebAutomation[] = [];
    try {
      automations = parseAutomationList(await this.webJson(`${bit(token)}/automation/list`), names);
    } catch (e) {
      errors.push(`Danh sách automation: ${(e as Error)?.message || e}`);
    }
    const workflows: WebAutomation[] = [];
    for (const b of meta.workflowBlocks.slice(0, 10)) {
      try {
        const j = await this.webJson(`${bit(token)}/workflow/detail?workflowID=${enc(b.workflowId)}&bizType=2`);
        if (j?.code !== 0) throw new Error(`${j?.code}: ${j?.msg || ''}`);
        workflows.push(summarizeWorkflow(j.data?.workflow, 'workflow', names, b.name));
      } catch (e) {
        errors.push(`Quy trình «${b.name}»: ${(e as Error)?.message || e}`);
      }
    }
    return { meta, tables, automations, workflows, errors };
  }

  /**
   * Tạo một Automation ở trạng thái TẮT — ĐÚNG request trình soạn Automation của Lark gửi (đọc từ
   * mã của chính trang, xem docs/lark-web-api.md): POST /space/api/bitable/automation/create
   * {token, draft, extra, triggerName, status:0}. Khi TẮT, trình soạn KHÔNG gửi flowSchema/nodeSchema
   * (chỉ tính khi bật) — nên bản nháp tắt không vướng lỗi 800004006 của đường cũ.
   * KHÔNG có tham số bật: status luôn là 0.
   */
  async createWebAutomation(token: string, p: { draft: string; extra: string; triggerName: string }): Promise<{ workflowID: string; raw: J }> {
    const body = { token, draft: p.draft, extra: p.extra, triggerName: p.triggerName, status: 0 };
    const j = await this.webJson('/space/api/bitable/automation/create', 'POST', body);
    if (j?.code !== 0) throw new Error(`Lark từ chối tạo automation (mã ${j?.code}: ${j?.msg || 'không rõ'}).`);
    const id = j?.data?.workflowID || j?.data?.workflowId || j?.data?.workflow?.workflowID;
    if (!id) throw new Error('Lark báo tạo xong nhưng không trả workflowID: ' + JSON.stringify(j?.data ?? null).slice(0, 300));
    return { workflowID: String(id), raw: j.data };
  }

  /** Đọc lại một automation theo id từ automation/list (draft/extra/status đúng như Lark lưu). */
  async readWebAutomation(token: string, workflowID: string): Promise<J | null> {
    const j = await this.webJson(`${bit(token)}/automation/list`);
    if (j?.code !== 0) throw new Error(`Không đọc lại được danh sách automation (mã ${j?.code}).`);
    const list: J[] = Array.isArray(j?.data?.workflowList) ? j.data.workflowList : [];
    return list.find((w) => String(w?.workflowID) === String(workflowID)) ?? null;
  }

  /** Đưa khung Lark tới Base (để người dùng/AI thấy ngay automation vừa tạo). Chỉ host Lark. */
  async showBase(token: string): Promise<void> {
    if (!this.win || this.win.isDestroyed() || !this.host) return;
    try {
      await this.win.loadURL(`${this.host}/base/${encodeURIComponent(token)}`, { userAgent: CHROME_UA });
    } catch {
      /* best-effort */
    }
  }

  /** Try a path; return its `data` on code 0, else null (for probing candidate endpoints).
   *  NEVER throws — an errored candidate must fall through to the next, not abort the loop. */
  private async tryData(path: string): Promise<unknown | null> {
    if (!this.win || this.win.isDestroyed()) return null;
    try {
      const res = await this.rawCall(path, 'GET');
      const j = res?.json as { code?: number; data?: unknown } | null | undefined;
      if (!j || (j.code !== undefined && j.code !== 0)) return null;
      return j.data ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Read a Base's workflow/automation LIST — MERGES every source because a Base exposes automation
   * objects through more than one internal endpoint (`/automation/list` = the Automation Center;
   * node-flow "Workflow" folders may use `/workflow/list` or a differently-named resource). Each
   * list item already EMBEDS the full draft/nodeSchema/extra + an explicit `workflowID`, and the
   * response carries a `user` id→name map. CONFIRMED: the real endpoints take NO `bizType` query.
   *
   * Provenance-aware validation: a SNIFFED path (the Lark app itself called it) is trusted
   * leniently; a SPECULATIVE guessed path is validated STRICTLY (must contain items with an
   * explicit workflow-id-named field) so a members/config array can't masquerade as a workflow list.
   */
  async readWorkflowList(baseId: string): Promise<{ workflows: Record<string, unknown>[]; users: Record<string, unknown> }> {
    if (!this.win || this.win.isDestroyed() || !this.host)
      throw new Error('Chưa kết nối Lark web. Vào Cài đặt → "Kết nối Lark web".');

    const cands: { path: string; sniffed: boolean }[] = [];
    const add = (path: string, sniffed: boolean) => {
      if (!cands.some((c) => c.path === path)) cands.push({ path, sniffed });
    };
    // 1) Sniffed LIST paths (skip per-item detail calls). Bitable path → swap base if different;
    //    non-bitable path (e.g. /space/api/base/… or /base/api/…) → probe AS-IS.
    for (const p of this.capturedPaths) {
      if (/\/detail\b|workflowID=/i.test(p)) continue;
      if (/\/space\/api\/bitable\//i.test(p)) {
        const capBase = p.match(BITABLE_BASE)?.[1];
        add(capBase === baseId ? p : p.replace(/(\/space\/api\/bitable\/)[^/]+/i, `$1${enc(baseId)}`), true);
      } else {
        add(p, true);
      }
    }
    // 2) Candidate list endpoints (no bizType — the confirmed shape). Automations + the various
    //    node-flow resource names. Validated STRICTLY.
    for (const r of ['automation', 'workflow', 'block_workflow', 'advance_workflow', 'node_flow', 'nodeflow']) {
      add(`${bit(baseId)}/${r}/list`, false);
      add(`${bit(baseId)}/${r}/list?bizType=2`, false);
    }

    const merged = new Map<string, Record<string, unknown>>();
    const users: Record<string, unknown> = {};
    let sawList = false;
    let sawKeys = '';
    for (const c of cands) {
      const data = await this.tryData(c.path);
      const arr = extractArray(data, !c.sniffed);
      if (!arr) {
        if (data && typeof data === 'object' && !sawKeys) sawKeys = Object.keys(data as object).slice(0, 8).join(', ');
        continue;
      }
      sawList = true;
      const u = (data as { user?: Record<string, unknown> })?.user;
      if (u && typeof u === 'object') Object.assign(users, u);
      for (const rec of arr) {
        if (!rec || typeof rec !== 'object') continue;
        const r = rec as Record<string, unknown>;
        const id = wfId(r) || `#${merged.size}`;
        if (!merged.has(id)) merged.set(id, r);
      }
    }
    if (!sawList) {
      const captured = this.capturedInfo();
      throw new Error(
        'Chưa lấy được DANH SÁCH workflow' +
          (sawKeys ? ` (một endpoint trả về {${sawKeys}}, không phải danh sách)` : '') +
          '. Hãy MỞ base trong cửa sổ Lark (Cài đặt → "Mở cửa sổ Lark"), vào thư mục "Workflow" / tab "Tự động hoá", bấm 1 mục cho nó tải, rồi "Làm mới" và thử lại — app sẽ tự bắt đúng endpoint.' +
          (captured.length ? ` [Đã bắt được: ${captured.slice(0, 8).join(' | ')}]` : ' [Chưa bắt được endpoint nào — hãy thao tác trong cửa sổ Lark của app, KHÔNG phải trình duyệt riêng.]'),
      );
    }
    return { workflows: [...merged.values()], users };
  }

  /** Read one workflow's detail — CONFIRMED endpoint (both Automations and node-flow Workflows use
   *  `/workflow/detail?workflowID=…&bizType=2`). Returns `data.workflow` (draft/nodeSchema/extra). */
  async readWorkflowDetail(baseId: string, workflowId: string): Promise<unknown> {
    if (!this.win || this.win.isDestroyed() || !this.host)
      throw new Error('Chưa kết nối Lark web. Vào Cài đặt → "Kết nối Lark web".');
    return this.fetchApi(`${bit(baseId)}/workflow/detail?workflowID=${enc(workflowId)}&bizType=2`);
  }

  // ── WRITE (EXPERIMENTAL — creates/edits/deletes real Lark automations) ──────
  // Confirmed request shapes from the Lark web app's own traffic. POSTs auto-attach the
  // `x-csrftoken` header (read from the `_csrf_token` cookie in rawCall) — required for writes.

  /** Create an EMPTY workflow shell; returns the new workflowID + the RAW response (for diagnostics). */
  async createWorkflow(baseId: string, opts: { triggerName?: string; source?: string; bizType?: string } = {}): Promise<{ workflowID: string; raw: J }> {
    const data = (await this.fetchApi<J>(`${bit(baseId)}/workflow/create`, 'POST', {
      token: baseId,
      draft: JSON.stringify({ steps: [] }),
      extra: JSON.stringify({ TableMap: {}, BlockMap: {}, WorkflowMap: {}, RelationInfo: {} }),
      triggerName: opts.triggerName ?? '',
      source: opts.source ?? 'workflow_block',
      bizType: opts.bizType ?? '2',
    })) as J;
    const id = data?.workflowID || data?.workflow?.workflowID || data?.id || data?.workflow_id || data?.workflowId;
    if (!id) throw new Error('Tạo workflow: không đọc được workflowID trả về (raw: ' + JSON.stringify(data).slice(0, 400) + ')');
    return { workflowID: String(id), raw: data };
  }

  /** Save (and optionally enable) a workflow's draft. `draft`/`extra` are JSON STRINGS. status:
   *  1 = bật, 0 = tắt. Endpoint has NO base in the path — the base goes in `token`. */
  async saveWorkflow(
    baseId: string,
    p: { workflowID: string; draft: string; extra: string; triggerName?: string; source?: string; status?: number; bizType?: string },
  ): Promise<unknown> {
    return this.fetchApi(`/space/api/bitable/automation/update`, 'POST', {
      token: baseId,
      draft: p.draft,
      extra: p.extra,
      triggerName: p.triggerName ?? '',
      source: p.source ?? 'workflow_block',
      workflowID: p.workflowID,
      status: p.status ?? 0,
      bizType: p.bizType ?? '2',
    });
  }

  /** Delete/disable a workflow. */
  async disableWorkflow(baseId: string, workflowID: string, bizType = '2'): Promise<unknown> {
    return this.fetchApi(`${bit(baseId)}/workflow/disable`, 'POST', { workflowID, bizType });
  }
}

// Loose alias for the write helpers (the internal API is dynamically shaped).
type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface RawResult {
  status?: number;
  finalUrl?: string;
  redirected?: boolean;
  pageUrl?: string;
  json?: { code?: number; msg?: string; data?: unknown } | null;
  snippet?: string | null;
  error?: string;
}
function enc(s: string): string {
  return encodeURIComponent(s);
}

/** Explicit workflow id from a list item (uses the KNOWN key — never guesses a long-numeric value,
 *  which used to grab a creator/user id by mistake). */
function wfId(w: Record<string, unknown>): string | null {
  for (const k of ['workflowID', 'workflowId', 'workflow_id', 'id']) {
    const v = w[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}
function hasWorkflowIdKey(w: Record<string, unknown>): boolean {
  return Object.keys(w).some((k) => /^(workflow|flow|block_?workflow|advance_?workflow)/i.test(k) && /id$/i.test(k));
}
function hasNameKey(w: Record<string, unknown>): boolean {
  return ['title', 'workflowName', 'name', 'workflow_name'].some((k) => typeof w[k] === 'string' && (w[k] as string).trim());
}
const LIST_KEYS = ['workflowList', 'workflows', 'automationList', 'automations', 'list', 'items', 'flowList', 'nodeFlows'];
/** Extract a workflow LIST array from a response `data`, or null. `strict` (for speculative guessed
 *  endpoints) requires items to carry an explicit workflow-id field + a name/draft, so a members or
 *  config array can't be accepted as a workflow list. Empty array = valid (a Base with 0 workflows). */
function extractArray(data: unknown, strict: boolean): Record<string, unknown>[] | null {
  if (!data) return null;
  const o = data as Record<string, unknown>;
  let arr: unknown = Array.isArray(data) ? data : undefined;
  if (arr === undefined) for (const k of LIST_KEYS) if (Array.isArray(o[k])) { arr = o[k]; break; }
  if (!Array.isArray(arr)) return null;
  if (arr.length === 0) return [];
  const ok = arr.some((w) => {
    if (!w || typeof w !== 'object') return false;
    const r = w as Record<string, unknown>;
    return strict
      ? hasWorkflowIdKey(r) && (hasNameKey(r) || !!r.draft || !!r.nodeSchema)
      : hasWorkflowIdKey(r) || !!r.draft || !!r.nodeSchema || hasNameKey(r);
  });
  return ok ? (arr as Record<string, unknown>[]) : null;
}

// ── Module singleton (tools reach it directly; LarkService owns its lifecycle) ──
let instance: LarkWebSession | null = null;
export function getLarkWebSession(): LarkWebSession {
  if (!instance) instance = new LarkWebSession();
  return instance;
}

/** Extract the `https://host` origin from a URL string (null if invalid). */
function safeOrigin(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
