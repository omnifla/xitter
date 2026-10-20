// /account/theme settings page: themePage, themeRoute, EDITOR_SCRIPT, PAGE_CSS, form handling.

import type { Viewer } from "../auth";
import { validateFamily } from "../fonts";
import { FONT_SUGGESTIONS, PRESET_NAMES, PRESETS, SWATCH_IDS, type Fill, type Gradient, type Theme } from "./presets";
import { OPTIONAL_FILL, OPTIONAL_HEX, derived, fillCss, parseLookWrite, solidOf } from "./validate";
import { fontLinks, resolveBackground } from "./css";
import { commitLook, loadPrefs, nightModeCookies } from "./api";

const PAGE_CSS = `
form.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;width:100%;justify-items:stretch;align-items:stretch}
.pick{display:flex;flex-direction:column;align-items:stretch;gap:8px;width:100%;height:100%;min-width:0;padding:8px;border-radius:12px;background:var(--surface);color:var(--text);font-weight:500;white-space:normal;text-align:left}
.pick .swatch{width:100%;aspect-ratio:16/9;height:auto;border-radius:8px}
.pick .name{font-size:13px;line-height:16px;font-weight:500;min-height:32px}
.pick.on{outline:2px solid var(--accent);outline-offset:0}
@media (hover:hover){.pick:hover:not(:disabled){background:var(--hover)}}
.choice{display:flex;align-items:center;gap:8px;color:var(--text);margin:0;font-size:15px}
.choice input{width:20px;min-height:20px;height:20px;margin:0;padding:0;accent-color:var(--accent)}
form.editor{display:grid;gap:16px;width:100%;max-width:100%;min-width:0;justify-items:stretch}
.toks{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;width:100%;min-width:0}
@media (max-width:520px){.toks{grid-template-columns:1fr}}
.tok{display:grid;grid-template-columns:1fr auto auto auto;gap:6px;align-items:center;margin:0;min-width:0}
.tok > span{font-size:13px;color:var(--muted);min-width:0}
.tok input[type=color]{width:40px;height:28px;min-height:28px;padding:1px;border:1px solid var(--outline);border-radius:6px;background:none;cursor:pointer}
.tok .x,.tok .g{min-height:28px;min-width:28px;padding:0 8px;font-size:14px}
.tok .g[aria-pressed="true"]{background:var(--hover)}
.grow{display:grid;gap:8px;width:100%;min-width:0}
.grow > span{font-size:13px;line-height:16px;color:var(--muted)}
.grow-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.tiny{min-height:28px;padding:0 10px;font-size:13px}
.gstop{display:flex;flex-wrap:wrap;gap:6px;align-items:center;grid-column:1/-1}
.gstop label{display:grid;gap:2px;margin:0;font-size:11px}
.gstop input[type=color]{width:40px;height:28px;min-height:28px;padding:1px;border:1px solid var(--outline);border-radius:6px;background:none}
.ang{display:flex;align-items:center;gap:8px;flex:1 1 160px;min-width:0;margin:0;font-size:13px;line-height:16px;color:var(--muted)}
.ang input[type=range]{flex:1;min-width:0;width:auto;min-height:24px;padding:0;border:0;background:transparent}
.ang .deg{font-variant-numeric:tabular-nums;min-width:3.5ch}
.h3{font-size:13px;font-weight:700;margin:0;color:var(--text)}
details.adv .h3{margin:12px 0 4px}
details.adv{border:1px solid var(--border);border-radius:12px;padding:8px 12px;width:100%;min-width:0}
details.adv summary{cursor:pointer;font-weight:700}
.fonts{display:grid;gap:12px;width:100%;min-width:0}
.fg{display:grid;gap:6px;min-width:0}
.fg > span{font-size:13px;line-height:16px;color:var(--muted)}
.fg .line{display:flex;gap:8px;align-items:center;min-width:0}
.fg .line input{flex:1 1 auto;min-width:0;width:auto;min-height:36px;font-size:15px}
.fg .fp{margin:0;font-size:14px;line-height:18px;color:var(--text)}
.live{width:100%;min-width:0;border:1px solid var(--border);border-radius:16px;overflow:hidden}
@media (min-width:601px){.live{position:sticky;top:61px;z-index:1}}
.live .stage{display:grid;grid-template-columns:56px minmax(0,1fr) minmax(0,104px);color:var(--pv-text,#e7e9ea);background:var(--pv-bg,#000)}
.live .nav{padding:8px 6px;display:grid;gap:8px;align-content:start;font-size:12px;font-weight:700;background:var(--pv-header,transparent)}
.live .nav .on{color:var(--pv-icon-active,var(--pv-text))}
.live .feed{border-inline:1px solid var(--pv-border,#2f3336);padding:8px;background:transparent;min-width:0}
.live .cardp{display:grid;grid-template-columns:32px minmax(0,1fr);gap:8px;padding:6px;border-radius:12px;background:var(--pv-surface,#16181c);position:relative}
.live .ava{width:32px;height:32px;border-radius:50%;background:var(--pv-muted,#71767b)}
.live .who{font-size:13px}
.live .who b{color:var(--pv-text,#e7e9ea);font-family:var(--pv-display,inherit)}
.live .who span{color:var(--pv-muted,#71767b)}
.live .body{font-family:var(--pv-ui,inherit)}
.live a.lk{color:var(--pv-link,var(--pv-accent,#1d9bf0))}
.live .acts{display:flex;gap:12px;margin-top:8px;font-size:13px}
.live .acts span{display:flex;align-items:center;gap:4px}
.live .acts .r{color:var(--pv-reply)}
.live .acts .t{color:var(--pv-repost)}
.live .acts .h{color:var(--pv-like)}
.live .acts .b{color:var(--pv-bookmark,var(--pv-accent))}
.live .acts .v{color:var(--pv-views,var(--pv-muted))}
.live .cardp:hover{background:color-mix(in srgb, var(--pv-text) 10%, var(--pv-surface))}
.live .badge{position:absolute;top:8px;right:8px;min-width:16px;height:16px;padding:0 4px;border-radius:9999px;background:var(--pv-badge);color:#fff;font-size:11px;line-height:16px;text-align:center}
.live .side{padding:8px 6px;display:grid;gap:6px;align-content:start;min-width:0}
.live .search{height:28px;min-height:28px;width:100%;border-radius:9999px;background:var(--pv-input,var(--pv-surface));border:1px solid var(--pv-input-border,var(--pv-border));color:var(--pv-input-text,var(--pv-text));padding:0 10px;font:inherit;font-size:12px}
.live .menu{background:var(--pv-menu,var(--pv-surface));border:1px solid var(--pv-border);border-radius:12px;padding:8px;font-size:13px}
.live .pill,.live .pill:hover,.live .ghost,.live .ghost:hover{min-height:28px;width:100%;padding:0 8px;border-radius:9999px;font:inherit;font-size:12px;font-weight:700;cursor:default}
.live .pill,.live .pill:hover{border:0;background:var(--pv-button,#eff3f4);color:var(--pv-button-text,#0f1419)}
.live .ghost,.live .ghost:hover{border:1px solid var(--pv-sec-border,var(--pv-border));background:var(--pv-sec-button,transparent);color:var(--pv-sec-text,var(--pv-text))}
@media (max-width:600px){
.live{position:static}
.live .stage{grid-template-columns:minmax(0,1fr)}
.live .nav,.live .side{display:none}
.live .feed{border-inline:0}
}
.share{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.share a,.file{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border-radius:9999px;border:1px solid var(--border);text-decoration:none;color:var(--text)}
.file input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
#theme-import-errors{margin:0;padding:0;list-style:none;color:#f4212e}
#theme-import-errors:not(:empty){padding:10px 12px;border:1px solid #f4212e;border-radius:12px;background:rgba(244,33,46,.08)}
#theme-import-errors li.head{font-weight:700}
#theme-import-errors li{margin:0 0 4px}
.bgopt{display:grid;gap:8px}
.bgopt .line{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bgopt select{min-height:36px;border-radius:8px;border:1px solid var(--outline);background:var(--field);color:var(--text)}
#bg-preview{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none}
.live .stage{position:relative;z-index:1}
.note{margin:0;padding:8px 10px;border-radius:8px;font-size:13px;line-height:16px;background:rgb(255 212 0 / .16);color:#8a5800}
:root[data-theme="dark"] .note,:root[data-theme="dim"] .note{color:#e6b800;background:rgb(255 212 0 / .12)}
.warns{display:grid;gap:4px}
.warns p{color:#8a5800;font-size:13px}
:root[data-theme="dark"] .warns p,:root[data-theme="dim"] .warns p{color:#e6b800}
.savebar{display:flex;gap:8px;align-items:center;width:100%;padding:4px 0 0}
.savebar button[type=submit]{flex:1}
`;

const EDITOR_SCRIPT = String.raw`(function(){
	var f=document.getElementById("custom"),prev=document.getElementById("preview"),warn=document.getElementById("warns");
	if(!f||!prev)return;
	function val(name){return f[name]?f[name].value:""}
	function setv(name,v){if(f[name])f[name].value=v}
	function flagged(name){return val(name+"_set")==="1"}
	function flag(name,on){setv(name+"_set",on?"1":"")}
	function stops(name){return [].map.call(f.querySelectorAll('input[name="'+name+'"]'),function(i){return i.value})}
	function hexRgb(h){h=String(h||"").replace("#","");if(h.length===3)h=h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2);return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
	function toHex(c){return "#"+c.map(function(n){n=Math.round(Math.max(0,Math.min(255,n)));return (n<16?"0":"")+n.toString(16)}).join("")}
	function mix(a,b,t){var A=hexRgb(a),B=hexRgb(b);return toHex([A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t])}
	function lin(c){var s=c/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4)}
	function lum(h){var c=hexRgb(h);return 0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2])}
	function contrast(a,b){var L1=lum(a),L2=lum(b),hi=Math.max(L1,L2),lo=Math.min(L1,L2);return (hi+0.05)/(lo+0.05)}
	function fill(stops,angle){return !stops||!stops.length?"#000":(stops.length<=1?stops[0]:"linear-gradient("+angle+"deg,"+stops.join(",")+")")}
	function avg(stops){if(!stops.length)return "#000";var a=[0,0,0];stops.forEach(function(s){var c=hexRgb(s);a[0]+=c[0];a[1]+=c[1];a[2]+=c[2]});return toHex([a[0]/stops.length,a[1]/stops.length,a[2]/stops.length])}
	function fontOk(n){return /^[A-Za-z0-9 ]{1,40}$/.test(n)}
	function loadFont(name){
		if(!fontOk(name))return;
		var slug=name.toLowerCase().replace(/ /g,"-"),id="xf-"+slug;
		if(document.getElementById(id))return;
		var l=document.createElement("link");l.id=id;l.rel="stylesheet";l.href="/i/xitter/fonts/"+slug+"/fonts.css?family="+encodeURIComponent(name);document.head.appendChild(l);
	}
	var ADV=["link","secondary","muted","border","divider","hover","inputBg","inputText","inputBorder","header","menu","tooltip","icon","iconActive","reply","repost","like","bookmark","views","secondaryButton","secondaryButtonBorder","secondaryButtonText","buttonHover","badge","selection"];
	function basics(){
		return {bg:stops("bg"),bgA:val("bg_angle")||"180",surface:val("surface"),text:val("text"),accent:val("accent"),button:stops("button"),btnA:val("button_angle")||"180",buttonText:val("buttonText")}
	}
	function derivedOf(){
		var b=basics(),avgBg=avg(b.bg),tr=b.text,muted=mix(tr,avgBg,0.45),border=mix(tr,avgBg,0.82);
		return {
			link:b.accent,secondary:mix(tr,avgBg,0.28),muted:muted,border:border,divider:border,hover:b.text,
			inputBg:mix(b.surface,tr,0.08),inputText:tr,inputBorder:border,header:avgBg,menu:b.surface,tooltip:mix(b.surface,tr,0.16),
			icon:muted,iconActive:tr,reply:b.accent,repost:"#00ba7c",like:"#f91880",bookmark:b.accent,views:muted,
			secondaryButton:b.surface,secondaryButtonBorder:border,secondaryButtonText:tr,buttonHover:mix(avg(b.button),tr,0.12),badge:b.accent,selection:b.accent
		};
	}
	function fillVal(name,fallback){
		if(val(name+"_grad")==="1"){
			var st=stops(name+"_stop");
			return fill(st.length?st:[val(name)||fallback],val(name+"_angle")||"180");
		}
		return (name==="surface"||flagged(name))?val(name)||fallback:fallback;
	}
	function draw(){
		var b=basics(),d=derivedOf(),ui=val("font_ui").trim(),display=val("font_display").trim();
		function tok(name,fallback){return flagged(name)?val(name):fallback}
		prev.style.setProperty("--pv-bg",fill(b.bg,b.bgA));
		prev.style.setProperty("--pv-surface",fillVal("surface",b.surface));
		prev.style.setProperty("--pv-text",b.text);
		prev.style.setProperty("--pv-button",fill(b.button,b.btnA));
		prev.style.setProperty("--pv-button-text",b.buttonText);
		prev.style.setProperty("--pv-accent",fillVal("accent",b.accent));
		prev.style.setProperty("--pv-link",tok("link",d.link));
		prev.style.setProperty("--pv-muted",tok("muted",d.muted));
		prev.style.setProperty("--pv-border",tok("border",d.border));
		prev.style.setProperty("--pv-input",tok("inputBg",d.inputBg));
		prev.style.setProperty("--pv-input-text",tok("inputText",d.inputText));
		prev.style.setProperty("--pv-input-border",tok("inputBorder",d.inputBorder));
		prev.style.setProperty("--pv-menu",fillVal("menu",d.menu));
		prev.style.setProperty("--pv-reply",tok("reply",d.reply));
		prev.style.setProperty("--pv-repost",tok("repost",d.repost));
		prev.style.setProperty("--pv-like",tok("like",d.like));
		prev.style.setProperty("--pv-bookmark",tok("bookmark",d.bookmark));
		prev.style.setProperty("--pv-views",tok("views",d.views));
		prev.style.setProperty("--pv-icon-active",tok("iconActive",d.iconActive));
		prev.style.setProperty("--pv-header",fillVal("header",d.header));
		prev.style.setProperty("--pv-badge",tok("badge",d.badge));
		prev.style.setProperty("--pv-sec-button",fillVal("secondaryButton",d.secondaryButton));
		prev.style.setProperty("--pv-sec-border",tok("secondaryButtonBorder",d.secondaryButtonBorder));
		prev.style.setProperty("--pv-sec-text",tok("secondaryButtonText",d.secondaryButtonText));
		var chirp='TwitterChirp,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
		if(fontOk(ui)){loadFont(ui);prev.style.setProperty("--pv-ui",'"'+ui+'",'+chirp);document.getElementById("fp-ui").style.fontFamily='"'+ui+'",'+chirp}
		else {prev.style.setProperty("--pv-ui",chirp);document.getElementById("fp-ui").style.fontFamily=chirp}
		if(fontOk(display)){loadFont(display);prev.style.setProperty("--pv-display",'"'+display+'",'+chirp);document.getElementById("fp-display").style.fontFamily='"'+display+'",'+chirp}
		else {prev.style.setProperty("--pv-display",chirp);document.getElementById("fp-display").style.fontFamily=chirp}
		ADV.forEach(function(n){if(!flagged(n)&&f[n]&&f[n].type==="color")f[n].value=d[n]||f[n].value});
		f.querySelectorAll("[data-deg]").forEach(function(s){s.textContent=(val(s.getAttribute("data-deg"))||"180")+"°"});
		function worst(fg,bgs){
			var w=Infinity,i;
			for(i=0;i<bgs.length;i++){
				if(!fg||!bgs[i]||String(bgs[i]).indexOf("rgb")===0)continue;
				var c=contrast(fg,bgs[i]);
				if(c<w)w=c;
			}
			return w;
		}
		function setNote(name,text){
			var el=f.querySelector('[data-warn="'+name+'"]');
			if(!el)return;
			if(text){el.hidden=false;el.textContent=text}else{el.hidden=true;el.textContent=""}
		}
		function raiseNote(label,fg,bgs){
			var c=worst(fg,bgs);
			return isFinite(c)&&c<4.5?label+" "+c.toFixed(1)+":1 — will be raised to readable":"";
		}
		setNote("text",raiseNote("Text on background",b.text,b.bg.concat([b.surface])));
		setNote("button",raiseNote("Text on button",b.buttonText,b.button));
		var msgs=[],i;
		function check(label,fg,bgs,min){
			for(i=0;i<bgs.length;i++){
				if(!fg||!bgs[i]||bgs[i].indexOf("rgb")===0)continue;
				var c=contrast(fg,bgs[i]);
				if(c<(min||4.5))msgs.push(label+" on "+bgs[i]+" is "+c.toFixed(2)+":1");
			}
		}
		check("link",tok("link",d.link),b.bg.concat([b.surface]));
		check("muted",tok("muted",d.muted),b.bg.concat([b.surface]),3);
		if(warn){warn.textContent="";msgs.forEach(function(m){var p=document.createElement("p");p.textContent=m;warn.appendChild(p)})}
	}
	function addStop(name,max){
		var row=f.querySelector('[data-stops="'+name+'"]');
		if(!row||row.querySelectorAll("input[type=color]").length>=max)return;
		var n=row.querySelectorAll("input[type=color]").length+1;
		var inp=document.createElement("input");
		inp.type="color";inp.name=name;inp.value="#1d9bf0";
		inp.setAttribute("aria-label","Stop "+n);
		row.appendChild(inp);
		draw();
	}
	function dropStop(name){
		var row=f.querySelector('[data-stops="'+name+'"]');
		var ins=row&&row.querySelectorAll("input[type=color]");
		if(!ins||ins.length<=1)return;
		var last=ins[ins.length-1],wrap=last.parentElement;
		if(wrap&&wrap!==row&&wrap.tagName==="LABEL")wrap.remove();
		else last.remove();
		draw();
	}
	f.addEventListener("input",function(e){
		var t=e.target;
		if(t&&t.getAttribute&&t.getAttribute("data-adv"))flag(t.getAttribute("data-adv"),true);
		draw();
	});
	f.addEventListener("change",draw);
	f.querySelectorAll("[data-add]").forEach(function(b){b.addEventListener("click",function(){addStop(b.getAttribute("data-add"),5)})});
	f.querySelectorAll("[data-drop]").forEach(function(b){b.addEventListener("click",function(){dropStop(b.getAttribute("data-drop"))})});
	f.querySelectorAll("[data-gtoggle]").forEach(function(b){b.addEventListener("click",function(){
		var n=b.getAttribute("data-gtoggle"),on=b.getAttribute("aria-pressed")!=="true";
		b.setAttribute("aria-pressed",on?"true":"false");
		setv(n+"_grad",on?"1":"");
		if(n!=="surface")flag(n,true);
		var row=f.querySelector('[data-stops="'+n+'_stop"]');
		var ang=f.querySelector('input[name="'+n+'_angle"]');
		if(row)row.hidden=!on;
		if(ang&&ang.parentElement&&ang.parentElement.classList.contains("ang"))ang.parentElement.hidden=!on;
		if(on&&row&&!row.querySelector("input")&&f[n]){
			var inp=document.createElement("input");inp.type="color";inp.name=n+"_stop";inp.value=f[n].value;
			inp.setAttribute("aria-label","Stop 1");
			row.appendChild(inp);
		}
		draw();
	})});
	function hideGrad(n){
		setv(n+"_grad","");
		var tog=f.querySelector('[data-gtoggle="'+n+'"]');
		if(tog)tog.setAttribute("aria-pressed","false");
		var row=f.querySelector('[data-stops="'+n+'_stop"]');
		if(row)row.hidden=true;
		var ang=f.querySelector('input[name="'+n+'_angle"]');
		if(ang&&ang.parentElement&&ang.parentElement.classList.contains("ang"))ang.parentElement.hidden=true;
	}
	f.querySelectorAll("[data-reset]").forEach(function(b){b.addEventListener("click",function(){
		var n=b.getAttribute("data-reset");
		if(n==="font_ui"||n==="font_display"){setv(n,"");draw();return}
		flag(n,false);hideGrad(n);draw();
	})});
	var all=f.querySelector("[data-reset-all]");
	if(all)all.addEventListener("click",function(){
		setv("base","dark");setv("text","#f7f9f9");setv("surface","#1e2732");setv("accent","#1d9bf0");setv("buttonText","#0f1419");
		setv("font_ui","");setv("font_display","");
		ADV.forEach(function(n){flag(n,false);hideGrad(n)});
		hideGrad("surface");hideGrad("accent");
		var bg=f.querySelector('[data-stops="bg"]');
		if(bg){bg.querySelectorAll("input[type=color]").forEach(function(i,n){if(n===0)i.value="#15202b";else i.parentElement.remove()})}
		var btn=f.querySelector('[data-stops="button"]');
		if(btn){btn.querySelectorAll("input[type=color]").forEach(function(i,n){if(n===0)i.value="#eff3f4";else i.parentElement.remove()})}
		setv("bg_angle","180");setv("button_angle","180");
		var dark=f.querySelector('input[name="base"][value="dark"]');if(dark)dark.checked=true;
		draw();
	});
	function csrf(){return (document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)||[])[1]||""}
	function showErrors(errors){
		var list=document.getElementById("theme-import-errors");
		if(!list)return;
		list.replaceChildren();
		if(errors&&errors.length){var head=document.createElement("li");head.className="head";head.textContent="This theme file was rejected. Nothing was applied.";list.appendChild(head)}
		(errors||[]).forEach(function(error){
			var item=document.createElement("li");
			item.textContent=error.path?error.path+": "+error.message:error.message;
			list.appendChild(item);
		});
	}
	function showWarnings(warnings){
		var box=document.getElementById("theme-import-warnings");
		if(!box)return;
		box.replaceChildren();
		(warnings||[]).forEach(function(w){
			var p=document.createElement("p");
			p.className="dim";
			p.textContent=w;
			box.appendChild(p);
		});
	}
	function showBg(path){
		var img=document.getElementById("bg-preview");
		if(!/^\/media\/\d{1,19}\.(png|gif|webp|jpg)$/.test(path||"")){
			if(img)img.remove();
			return;
		}
		if(!img){
			img=document.createElement("img");
			img.id="bg-preview";
			img.alt="";
			prev.insertBefore(img, prev.firstChild);
		}
		var fit=val("bg_fit")||"cover";
		img.style.objectFit=fit==="contain"?"contain":fit==="tile"?"none":"cover";
		img.src=path;
	}
	function setStops(name, list){
		var row=f.querySelector('[data-stops="'+name+'"]');
		if(!row||!list||!list.length)return;
		row.replaceChildren();
		list.forEach(function(hex,i){
			if(!/^#[0-9a-f]{6}$/.test(hex))return;
			var inp=document.createElement("input");
			inp.type="color";inp.name=name;inp.value=hex;
			inp.setAttribute("aria-label","Stop "+(i+1));
			row.appendChild(inp);
		});
	}
	function applyImported(theme){
		if(!theme||typeof theme!=="object")return;
		if(theme.base==="light"||theme.base==="dark"){
			var radio=f.querySelector('input[name="base"][value="'+theme.base+'"]');
			if(radio)radio.checked=true;
		}
		if(theme.bg&&theme.bg.stops){setStops("bg",theme.bg.stops);setv("bg_angle",String(theme.bg.angle||180))}
		if(theme.button&&theme.button.stops){setStops("button",theme.button.stops);setv("button_angle",String(theme.button.angle||180))}
		["surface","text","accent","buttonText"].forEach(function(name){
			var value=theme[name];
			if(typeof value==="string"&&/^#[0-9a-f]{6}$/.test(value)){setv(name,value);hideGrad(name)}
			else if(value&&value.stops){
				setv(name,value.stops[0]);
				setv(name+"_grad","1");
				var tog=f.querySelector('[data-gtoggle="'+name+'"]');
				if(tog)tog.setAttribute("aria-pressed","true");
				var row=f.querySelector('[data-stops="'+name+'_stop"]');
				if(row){row.hidden=false;row.replaceChildren();value.stops.forEach(function(hex,i){
					if(!/^#[0-9a-f]{6}$/.test(hex))return;
					var inp=document.createElement("input");
					inp.type="color";inp.name=name+"_stop";inp.value=hex;
					inp.setAttribute("aria-label","Stop "+(i+1));
					row.appendChild(inp);
				})}
				setv(name+"_angle",String(value.angle||180));
				var ang=f.querySelector('input[name="'+name+'_angle"]');
				if(ang&&ang.parentElement)ang.parentElement.hidden=false;
			}
		});
		ADV.forEach(function(name){
			var value=theme[name];
			if(typeof value==="string"&&/^#[0-9a-f]{6}$/.test(value)){flag(name,true);setv(name,value);hideGrad(name)}
			else if(value&&value.stops){
				flag(name,true);
				setv(name+"_grad","1");
				setv(name,value.stops[0]);
			}
		});
		setv("font_ui",theme.font&&typeof theme.font.ui==="string"?theme.font.ui:"");
		setv("font_display",theme.font&&typeof theme.font.display==="string"?theme.font.display:"");
		if(theme.background){
			setv("background_on","1");
			setv("background_clear","");
			setv("bg_fit",theme.background.fit||"cover");
			setv("bg_position",theme.background.position||"center");
			setv("bg_dim",String(theme.background.dim||0));
			setv("bg_blur",String(theme.background.blur||0));
		}
		draw();
	}
	var file=document.getElementById("theme-file");
	if(file)file.addEventListener("change",function(){
		var picked=file.files&&file.files[0];
		if(!picked)return;
		if(picked.size>65536){showErrors([{path:"",message:"file is too large"}]);file.value="";return}
		picked.text().then(function(text){
			return fetch("/i/api/xitter/theme/import",{method:"POST",headers:{"x-csrf-token":csrf(),"content-type":"text/plain"},body:text}).then(function(r){return r.json()});
		}).then(function(data){
			if(!data||data.ok===false){showErrors(data&&data.errors);showWarnings([]);return}
			showErrors([]);
			showWarnings(data.warnings);
			applyImported(data.theme);
		}).catch(function(){showErrors([{path:"",message:"import failed"}])});
		file.value="";
	});
	var bgFile=document.getElementById("bg-file");
	if(bgFile)bgFile.addEventListener("change",function(){
		var picked=bgFile.files&&bgFile.files[0];
		if(!picked)return;
		var note=document.getElementById("bg-note");
		if(picked.size>8*1024*1024){if(note)note.textContent="image is too large";bgFile.value="";return}
		if(note)note.textContent="";
		var headers={"x-csrf-token":csrf()};
		fetch("/i/media/upload.json?command=INIT&total_bytes="+picked.size+"&media_type="+encodeURIComponent(picked.type||"image/png")+"&media_category=theme_background",{method:"POST",headers:headers}).then(function(r){return r.json()}).then(function(init){
			if(!init||!init.media_id_string)throw new Error((init&&init.error)||"upload failed");
			var body=new FormData();
			body.set("media",picked);
			return fetch("/i/media/upload.json?command=APPEND&media_id="+init.media_id_string+"&segment_index=0",{method:"POST",headers:headers,body:body}).then(function(){
				return fetch("/i/media/upload.json?command=FINALIZE&media_id="+init.media_id_string,{method:"POST",headers:headers}).then(function(r){return r.json()});
			});
		}).then(function(done){
			if(!done||!done.media_id_string)throw new Error((done&&done.error)||"upload failed");
			setv("background_on","1");
			setv("background_clear","");
			setv("background_media",done.media_id_string);
			if(typeof done.theme_path==="string"){prev.setAttribute("data-bg",done.theme_path);showBg(done.theme_path)}
		}).catch(function(err){if(note)note.textContent=err&&err.message?err.message:"upload failed"});
		bgFile.value="";
	});
	var bgClear=document.getElementById("bg-clear");
	if(bgClear)bgClear.addEventListener("click",function(){
		setv("background_clear","1");
		setv("background_on","");
		setv("background_media","");
		prev.removeAttribute("data-bg");
		showBg("");
	});
	["bg_fit","bg_position","bg_dim","bg_blur"].forEach(function(name){
		var el=f[name];
		if(!el)return;
		el.addEventListener("input",function(){
			if(val("background_clear")!=="1")setv("background_on","1");
			var num=document.querySelector('[data-num="'+name+'"]');
			if(num)num.textContent=el.value;
			showBg(prev.getAttribute("data-bg")||"");
		});
	});
	showBg(prev.getAttribute("data-bg")||"");
	draw();
})();`;

function stopInputs(name: string, g: Gradient) {
	return g.stops.map((s, i) => `<input type="color" name="${name}" value="${s}" aria-label="Stop ${i + 1}">`).join("");
}

function gradRow(label: string, name: string, g: Gradient) {
	return `<div class="grow"><span>${label}</span><div class="gstop" data-stops="${name}">${stopInputs(name, g)}</div><div class="grow-tools"><button type="button" class="secondary tiny" data-add="${name}">+ stop</button><button type="button" class="secondary tiny" data-drop="${name}">− stop</button><label class="ang">Angle<input type="range" name="${name}_angle" min="0" max="360" value="${g.angle}"><span class="deg" data-deg="${name}_angle">${g.angle}°</span></label></div></div>`;
}

function colorRow(label: string, name: string, value: string, set: boolean, reset = true) {
	return `<label class="tok"><span>${label}</span><input type="color" name="${name}" data-adv="${name}" value="${value}"><input type="hidden" name="${name}_set" value="${set ? "1" : ""}">${reset ? `<button type="button" class="secondary x" data-reset="${name}" title="Reset">×</button>` : `<span></span>`}<span></span></label>`;
}

function asGrad(v: Fill, fallback: string): Gradient {
	return typeof v === "object" ? v : { stops: [typeof v === "string" && /^#/.test(v) ? v : fallback], angle: 180 };
}

function fillRow(label: string, name: string, value: Fill, fallback: string, set: boolean, reset: boolean) {
	const g = asGrad(value, fallback);
	const on = typeof value === "object" && value.stops.length > 1;
	const solid = solidOf(typeof value === "string" || typeof value === "object" ? value : fallback);
	return `<div class="tok" data-fill="${name}"><span>${label}</span><input type="color" name="${name}" data-adv="${name}" value="${/^#/.test(solid) ? solid : fallback}"><button type="button" class="secondary g" data-gtoggle="${name}" aria-pressed="${on}" title="Gradient">G</button>${reset ? `<button type="button" class="secondary x" data-reset="${name}" title="Reset">×</button>` : `<span></span>`}<input type="hidden" name="${name}_set" value="${set ? "1" : ""}"><input type="hidden" name="${name}_grad" value="${on ? "1" : ""}"><div class="gstop" data-stops="${name}_stop"${on ? "" : " hidden"}>${stopInputs(`${name}_stop`, g)}</div><label class="ang"${on ? "" : " hidden"}>Angle<input type="range" name="${name}_angle" min="0" max="360" value="${g.angle}"><span class="deg" data-deg="${name}_angle">${g.angle}°</span></label></div>`;
}

function formFill(f: FormData, name: string): unknown {
	if (String(f.get(`${name}_grad`) ?? "") === "1") {
		const stops = f.getAll(`${name}_stop`);
		if (stops.length) return { stops, angle: Number(f.get(`${name}_angle`)) };
	}
	return f.get(name);
}

function fromForm(f: FormData): { clear?: true; theme?: unknown } {
	if (f.has("preset")) {
		const id = String(f.get("preset") ?? "");
		if (!id) return { clear: true };
		return { theme: { id } };
	}
	const theme: Record<string, unknown> = {
		id: "custom",
		base: String(f.get("base") ?? ""),
		bg: { stops: f.getAll("bg"), angle: Number(f.get("bg_angle")) },
		surface: formFill(f, "surface"),
		text: f.get("text"),
		accent: formFill(f, "accent"),
		button: { stops: f.getAll("button"), angle: Number(f.get("button_angle")) },
		buttonText: f.get("buttonText"),
	};
	for (const k of OPTIONAL_HEX) {
		if (String(f.get(`${k}_set`) ?? "") === "1") theme[k] = f.get(k);
	}
	for (const k of OPTIONAL_FILL) {
		if (String(f.get(`${k}_set`) ?? "") === "1") theme[k] = formFill(f, k);
	}
	const ui = validateFamily(String(f.get("font_ui") ?? ""));
	const display = validateFamily(String(f.get("font_display") ?? ""));
	if (ui || display) theme.font = { ...(ui ? { ui } : {}), ...(display ? { display } : {}) };
	if (String(f.get("background_clear") ?? "") === "1") theme.background = null;
	else if (String(f.get("background_on") ?? "") === "1") {
		const background: Record<string, unknown> = {
			fit: String(f.get("bg_fit") ?? "cover"),
			position: String(f.get("bg_position") ?? "center"),
			dim: Number(f.get("bg_dim") ?? 0),
			blur: Number(f.get("bg_blur") ?? 0),
		};
		const mediaId = String(f.get("background_media") ?? "");
		if (mediaId) background.mediaId = mediaId;
		theme.background = background;
	}
	return { theme };
}

function swatchStyle(g: Gradient) {
	return `background:${fillCss(g)}`;
}

async function themePage(req: Request, viewer: Viewer, current: Theme | null, notices: { error?: string; warnings?: string[] } = {}) {
	const { accountPage, esc } = await import("../account-page");
	const form = (fields: string, extra = "") =>
		`<form method="post" action="/account/theme" ${extra}><input type="hidden" name="csrf" value="${esc(viewer.csrf)}">${fields}</form>`;
	const pick = (id: string, name: string, g: Gradient, on: boolean) =>
		`<button type="submit" name="preset" value="${esc(id)}" class="pick${on ? " on" : ""}"><span class="swatch" style="${swatchStyle(g)}"></span><span class="name">${esc(name)}</span></button>`;
	const colors = current ?? PRESETS.dim!;
	const d = derived(colors);
	const hex = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : solidOf(colors.surface));
	const set = (k: keyof Theme) => current != null && current[k] != null;
	const opt = (label: string, name: keyof Theme, fallback: string) =>
		colorRow(label, name, hex(typeof colors[name] === "string" ? (colors[name] as string) : fallback), set(name));
	const fonts = FONT_SUGGESTIONS.map((n) => `<option value="${esc(n)}">`).join("");
	const bg = current?.background;
	const ownedBg = bg?.mediaId ? await resolveBackground(viewer.id, current!) : undefined;
	const bgPath = ownedBg && /^\/media\/\d{1,19}\.(?:png|gif|webp|jpg)$/.test(ownedBg.image) ? ownedBg.image : "";
	const body = `<h1>Theme</h1>
	<p class="dim">X dropped Dim; this puts it back, and lets you pick a look of your own. Dark themes sit on Lights out, light ones on Default. A typeface rides with a theme — Default / Lights out is X's own and has no custom font. Organisation profile decor keeps its own colours on the profile column.</p>
	${notices.error ? `<p class="error">${esc(notices.error)}</p>` : ""}
	${(notices.warnings ?? []).map((w) => `<p class="dim">${esc(w)}</p>`).join("")}
	<h2>Share</h2>
	<p class="share"><a class="secondary" href="/i/api/xitter/theme/export">Export theme</a><label class="secondary file">Import theme<input type="file" id="theme-file" accept="application/json,.json"></label></p>
	<ul id="theme-import-errors"></ul>
	<div id="theme-import-warnings"></div>
	<h2>Looks</h2>
	${form(
		`${pick("", "Default / Lights out (X's own)", { stops: ["#000000", "#ffffff"], angle: 90 }, !current)}
		${pick("dim", "Dim", PRESETS.dim!.bg, current?.id === "dim")}
		${SWATCH_IDS.map((id) => pick(id, PRESET_NAMES[id]!, PRESETS[id]!.bg, current?.id === id)).join("")}`,
		'class="swatches"',
	)}
	<h2>Custom</h2>
	${form(
		`<div class="row">
			<label class="choice"><input type="radio" name="base" value="dark"${colors.base !== "light" ? " checked" : ""}>Dark</label>
			<label class="choice"><input type="radio" name="base" value="light"${colors.base === "light" ? " checked" : ""}>Light</label>
		</div>
		<div class="live" id="preview" data-bg="${esc(bgPath)}">
			<div class="stage">
				<div class="nav"><span class="on">Home</span>Search<br>Profile</div>
				<div class="feed">
					<div class="cardp"><div class="ava"></div><div><div class="who"><b>Ada</b> <span>@ada</span></div><p class="body">A sample post with a <a class="lk" href="#">link</a> and <a class="lk" href="#">@mention</a>.</p><div class="acts"><span class="r">↩</span><span class="t">↻</span><span class="h">♥</span><span class="b">⚑</span><span class="v">12</span></div><span class="badge">2</span></div></div>
				</div>
				<div class="side"><input class="search" value="Search" readonly><div class="menu">A menu</div><button type="button" class="pill">Post</button><button type="button" class="ghost">Follow</button></div>
			</div>
		</div>
		${gradRow("Background", "bg", colors.bg)}
		<div class="toks">
			${fillRow("Surface", "surface", colors.surface, "#1e2732", true, false)}
			${colorRow("Text", "text", colors.text, true, false)}
			${fillRow("Accent / links", "accent", colors.accent, "#1d9bf0", true, false)}
			${colorRow("Button text", "buttonText", colors.buttonText, true, false)}
		</div>
		<p class="note" data-warn="text" hidden></p>
		${gradRow("Primary button", "button", colors.button)}
		<p class="note" data-warn="button" hidden></p>
		<div class="fonts">
			<p class="h3">Font</p>
			<div class="fg">
				<span>Text font</span>
				<div class="line">
					<input type="text" name="font_ui" list="font-ui" value="${esc(colors.font?.ui ?? "")}" placeholder="Chirp" maxlength="40" autocomplete="off">
					<button type="button" class="small secondary" data-reset="font_ui">Default</button>
				</div>
				<datalist id="font-ui">${fonts}</datalist>
				<p class="fp" id="fp-ui">The quick brown fox posts on Xitter</p>
			</div>
			<div class="fg">
				<span>Display names &amp; headings</span>
				<div class="line">
					<input type="text" name="font_display" list="font-display" value="${esc(colors.font?.display ?? "")}" placeholder="Same as text font" maxlength="40" autocomplete="off">
					<button type="button" class="small secondary" data-reset="font_display">Default</button>
				</div>
				<datalist id="font-display">${fonts}</datalist>
				<p class="fp" id="fp-display">Ada Lovelace</p>
			</div>
		</div>
		<details class="adv"><summary>Advanced</summary>
			<p class="h3">Text</p>
			<div class="toks">
				${opt("Secondary text", "secondary", d.secondary)}
				${opt("Muted text", "muted", d.muted)}
				${opt("Link colour", "link", d.link)}
			</div>
			<p class="h3">Lines</p>
			<div class="toks">
				${opt("Borders", "border", d.border)}
				${opt("Dividers", "divider", d.divider)}
			</div>
			<p class="h3">Surfaces</p>
			<div class="toks">
				${opt("Hover", "hover", /^#/.test(d.hover) ? d.hover : colors.text)}
				${opt("Input background", "inputBg", d.inputBg)}
				${opt("Input text", "inputText", d.inputText)}
				${opt("Input border", "inputBorder", d.inputBorder)}
				${fillRow("Header", "header", colors.header ?? d.header, hex(d.header), set("header"), true)}
				${fillRow("Menus", "menu", colors.menu ?? d.menu, hex(d.menu), set("menu"), true)}
				${opt("Tooltips", "tooltip", d.tooltip)}
			</div>
			<p class="h3">Icons</p>
			<div class="toks">
				${opt("Icons", "icon", d.icon)}
				${opt("Active nav icon", "iconActive", d.iconActive)}
			</div>
			<p class="h3">Actions</p>
			<div class="toks">
				${opt("Reply", "reply", d.reply)}
				${opt("Repost", "repost", d.repost)}
				${opt("Like", "like", d.like)}
				${opt("Bookmark / share", "bookmark", d.bookmark)}
				${opt("Views", "views", d.views)}
			</div>
			<p class="h3">Buttons</p>
			<div class="toks">
				${fillRow("Secondary button", "secondaryButton", colors.secondaryButton ?? (d.secondaryButton === "transparent" ? solidOf(colors.surface) : d.secondaryButton), solidOf(colors.surface), set("secondaryButton"), true)}
				${opt("Secondary border", "secondaryButtonBorder", d.secondaryButtonBorder)}
				${opt("Secondary text", "secondaryButtonText", d.secondaryButtonText)}
				${opt("Primary hover", "buttonHover", d.buttonHover)}
			</div>
			<p class="h3">Badges &amp; misc</p>
			<div class="toks">
				${opt("Notification badge", "badge", d.badge)}
				${opt("Selection", "selection", /^#/.test(d.selection) ? d.selection : solidOf(colors.accent))}
			</div>
			<div class="warns" id="warns"></div>
		</details>
		<div class="bgopt">
			<p class="h3">Background image</p>
			<p class="dim">The picture is not in an exported file. Upload it here, then save.</p>
			<input type="hidden" name="background_on" value="${bg ? "1" : ""}">
			<input type="hidden" name="background_clear" value="">
			<input type="hidden" name="background_media" value="${esc(bg?.mediaId ?? "")}">
			<div class="line">
				<label>Fit<select name="bg_fit"><option value="cover"${!bg || bg.fit === "cover" ? " selected" : ""}>Cover</option><option value="contain"${bg?.fit === "contain" ? " selected" : ""}>Contain</option><option value="tile"${bg?.fit === "tile" ? " selected" : ""}>Tile</option></select></label>
				<label>Position<select name="bg_position"><option value="center"${!bg || bg.position === "center" ? " selected" : ""}>Center</option><option value="top"${bg?.position === "top" ? " selected" : ""}>Top</option><option value="bottom"${bg?.position === "bottom" ? " selected" : ""}>Bottom</option></select></label>
			</div>
			<label class="ang">Dim<input type="range" name="bg_dim" min="0" max="80" value="${bg?.dim ?? 0}"><span class="deg" data-num="bg_dim">${bg?.dim ?? 0}</span></label>
			<label class="ang">Blur<input type="range" name="bg_blur" min="0" max="20" value="${bg?.blur ?? 0}"><span class="deg" data-num="bg_blur">${bg?.blur ?? 0}</span></label>
			<div class="line">
				<label class="secondary file">Upload image<input type="file" id="bg-file" accept="image/png,image/gif,image/webp,image/jpeg"></label>
				<button type="button" class="secondary" id="bg-clear">Remove image</button>
			</div>
			<p class="dim" id="bg-note"></p>
		</div>
		<div class="savebar">
			<button type="submit">Save theme</button>
			<button type="submit">Apply</button>
			<button type="button" class="secondary" data-reset-all>Reset all</button>
		</div>`,
		'id="custom" class="editor"',
	)}
	<script>${EDITOR_SCRIPT}</script>`;
	const head = fontLinks(current);
	return accountPage({ req, viewer, title: "Theme", status: notices.error ? 400 : 200, body, css: PAGE_CSS, head });
}

export async function themeRoute(req: Request, viewer: Viewer): Promise<Response> {
	const current = await loadPrefs(viewer.id);
	const theme = current.look?.kind === "painted" ? current.look.theme : null;
	if (req.method !== "POST") return themePage(req, viewer, theme);
	const f = await req.formData().catch(() => undefined);
	if (String(f?.get("csrf") ?? "") !== viewer.csrf) return themePage(req, viewer, theme, { error: "That form is out of date. Try again." });
	const parsed = parseLookWrite(fromForm(f!));
	if (!parsed.ok) return themePage(req, viewer, theme, { error: "That isn't a theme." });
	const saved = await commitLook(viewer.id, current, parsed.write, parsed.accent, parsed.warnings);
	const headers = new Headers({ location: "/account/theme" });
	for (const c of nightModeCookies(saved.look)) headers.append("set-cookie", c);
	return new Response(null, { status: 303, headers });
}
