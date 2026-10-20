// THEME_SCRIPT, the in-page boot script, and LINK_SCOPES it interpolates.

import { ACCENT_IDS, ACCENTS } from "./presets";
import { NIGHT_MODE_ATTR } from "./validate";

export const LINK_SCOPES = [
	'[data-testid="tweetText"]',
	'[data-testid="UserMention"]',
	'a[href*="/hashtag/"]',
	'[data-testid^="card.layout"]',
] as const;

export const THEME_SCRIPT = String.raw`(function(){
	var X=window.__XITTER__||{};
	var theme=X.theme||null;
	var look=X.look||null;
	var accents=${JSON.stringify(ACCENTS)};
	var accentIds=${JSON.stringify(ACCENT_IDS)};
	var accentWire=X.accent!=null?X.accent:(look&&look.accent!=null?look.accent:null);
	var forcedColor=(look&&look.themeColor)||X.themeColor||"blue500";
	var scopes=${JSON.stringify(LINK_SCOPES)};
	var presets=X.themePresets||[];
	var sheet,fontSheet,accentSheet,at=0,timer,key="",accentKey="";
	var CHIRP='TwitterChirp,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
	var TICK='<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M9.64 18.952l-5.55-4.861 1.317-1.504 3.951 3.459 8.459-10.948L19.4 6.32 9.64 18.952z"></path></g></svg>';
	var GOLD={"226, 183, 25":1,"212, 167, 44":1};
	var GREY={"130, 154, 171":1};
	function csrf(){return(document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)||[])[1]||""}
	function hexRgb(h){
		h=String(h||"").replace("#","");
		if(h.length===3)h=h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2);
		return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
	}
	function mix(a,b,t){
		return "#"+[0,1,2].map(function(i){var n=Math.round(a[i]+(b[i]-a[i])*t);return (n<16?"0":"")+n.toString(16)}).join("");
	}
	function fill(g){
		if(typeof g==="string")return g;
		return !g||!g.stops||!g.stops.length?"":(g.stops.length===1?g.stops[0]:"linear-gradient("+(g.angle||180)+"deg,"+g.stops.join(",")+")")
	}
	function avgOf(g){
		var stops=typeof g==="string"?[g]:(g&&g.stops?g.stops:["#000"]),acc=[0,0,0];
		stops.forEach(function(s){var c=hexRgb(s);acc[0]+=c[0];acc[1]+=c[1];acc[2]+=c[2]});
		var n=stops.length||1;
		return [acc[0]/n,acc[1]/n,acc[2]/n];
	}
	function hexOf(g){
		var a=avgOf(g);
		return "#"+[0,1,2].map(function(i){var x=Math.round(a[i]);return (x<16?"0":"")+x.toString(16)}).join("");
	}
	function rgba(h,a){var c=hexRgb(h);return "rgba("+c[0]+", "+c[1]+", "+c[2]+", "+a+")"}
	function fontOk(n){return typeof n==="string"&&/^[A-Za-z0-9 ]{1,40}$/.test(n)}
	function slugOf(n){return String(n).toLowerCase().replace(/ /g,"-")}
	function namedHex(id){return accents[id]||"#1d9bf0"}
	function resolveAccent(w){
		if(w==null)return {solid:"#1d9bf0",fill:"#1d9bf0",id:"blue500",custom:false};
		if(typeof w==="string"&&accents[w])return {solid:accents[w],fill:accents[w],id:w,custom:false};
		if(typeof w==="string"){
			var id=null,k;
			for(k in accents)if(accents[k]===w)id=k;
			return {solid:w,fill:w,id:id||"blue500",custom:!id};
		}
		var solid=hexOf(w),fl=fill(w)||solid;
		return {solid:solid,fill:fl,id:"blue500",custom:true};
	}
	var resolved=resolveAccent(accentWire);
	function lockLocal(obj){
		if(!obj||typeof obj!=="object")return obj;
		try{
			Object.defineProperty(obj,"themeColor",{configurable:true,enumerable:true,get:function(){return forcedColor},set:function(){}});
		}catch(e){obj.themeColor=forcedColor}
		return obj;
	}
	function seedThemeColor(){
		try{
			var s=window.__INITIAL_STATE__;
			if(s&&s.settings){
				s.settings._xtLocal=lockLocal(s.settings.local||{});
				try{
					Object.defineProperty(s.settings,"local",{
						configurable:true,
						get:function(){return s.settings._xtLocal},
						set:function(v){s.settings._xtLocal=lockLocal(v||{})}
					});
				}catch(e){s.settings.local=s.settings._xtLocal}
			}
		}catch(e){}
		try{
			var req=indexedDB.open("localforage");
			req.onsuccess=function(){
				var db=req.result;
				if(!db.objectStoreNames.contains("keyvaluepairs"))return;
				var tx=db.transaction("keyvaluepairs","readwrite");
				var store=tx.objectStore("keyvaluepairs");
				var g=store.get("device:rweb.settings");
				g.onsuccess=function(){
					var v=g.result;
					if(!v||typeof v!=="object")v={local:{}};
					if(!v.local||typeof v.local!=="object")v.local={};
					v.local.themeColor=forcedColor;
					store.put(v,"device:rweb.settings");
				};
			};
		}catch(e){}
	}
	function applyAccentVars(){
		var a=resolveAccent(accentWire),h=document.documentElement,hover=mix(hexRgb(a.solid),hexRgb("#0f1419"),0.12);
		h.style.setProperty("--xt-accent",a.solid);
		h.style.setProperty("--xt-accent-fill",a.fill);
		h.style.setProperty("--xt-accent-soft",rgba(a.solid,0.1));
		h.style.setProperty("--xt-accent-hover",hover);
		h.style.setProperty("--xt-accent-tint",mix(hexRgb(a.solid),hexRgb("#ffffff"),0.5));
		h.style.setProperty("--xt-accent-text",(hexRgb(a.solid)[0]*299+hexRgb(a.solid)[1]*587+hexRgb(a.solid)[2]*114)/1000>160?"#0f1419":"#ffffff");
		h.setAttribute("data-xitter-accent",a.custom?"custom":a.id);
		resolved=a;
		forcedColor=a.custom?"blue500":a.id;
	}
	function rgbKey(s){
		var m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s||"");
		return m?m[1]+", "+m[2]+", "+m[3]:"";
	}
	function keptCheck(svg){
		if(svg.querySelector("linearGradient,stop"))return true;
		var nodes=[svg].concat([].slice.call(svg.querySelectorAll("*"))),i,k,c;
		for(i=0;i<nodes.length;i++){
			c=getComputedStyle(nodes[i]);
			k=rgbKey(c.fill)||rgbKey(c.color);
			if(GOLD[k]||GREY[k])return true;
		}
		return false;
	}
	function accentGradUrl(){
		var a=resolved,id="xitter-accent-grad",ns="http://www.w3.org/2000/svg";
		if(!resolved.custom||resolved.fill.indexOf("gradient")<0)return resolved.solid;
		var g=document.getElementById(id);
		if(!g){
			var svg=document.createElementNS(ns,"svg");
			svg.setAttribute("width","0");svg.setAttribute("height","0");
			svg.style.cssText="position:absolute;width:0;height:0";
			var defs=document.createElementNS(ns,"defs");
			g=document.createElementNS(ns,"linearGradient");
			g.id=id;
			defs.appendChild(g);svg.appendChild(defs);
			document.documentElement.appendChild(svg);
		}
		var w=accentWire,stops=w&&w.stops?w.stops:[resolved.solid],ang=(w&&w.angle)||180,rad=ang*Math.PI/180;
		g.setAttribute("x1",String(0.5-0.5*Math.cos(rad)));
		g.setAttribute("y1",String(0.5-0.5*Math.sin(rad)));
		g.setAttribute("x2",String(0.5+0.5*Math.cos(rad)));
		g.setAttribute("y2",String(0.5+0.5*Math.sin(rad)));
		g.textContent="";
		stops.forEach(function(s,i){
			var st=document.createElementNS(ns,"stop");
			st.setAttribute("offset",stops.length===1?"0%":String(Math.round(i/(stops.length-1)*100))+"%");
			st.setAttribute("stop-color",s);
			g.appendChild(st);
		});
		return "url(#"+id+")";
	}
	function paintChecks(){
		var fill=accentGradUrl(),color=resolved.solid;
		document.querySelectorAll('svg[data-testid="icon-verified"]').forEach(function(svg){
			if(svg.closest("[data-xitter-badges],[data-xitter-frame],[data-xitter-framed],.xitter-deco,[data-xitter-decor-bg]"))return;
			if(keptCheck(svg))return;
			svg.style.setProperty("color",color,"important");
			svg.style.setProperty("fill",fill,"important");
			svg.querySelectorAll("path,g").forEach(function(n){
				var k=rgbKey(getComputedStyle(n).fill);
				if(GOLD[k]||GREY[k])return;
				n.style.setProperty("fill",fill,"important");
			});
		});
	}
	function varsOf(t){
		if(!t)return null;
		var avg=avgOf(t.bg),avgHex=hexOf(t.bg),tr=hexRgb(t.text||"#e7e9ea"),surface=hexOf(t.surface||avgHex),text=t.text,accent=hexOf(t.accent),accentFill=fill(t.accent)||accent;
		var muted=t.muted||mix(tr,hexRgb(avgHex),0.45),border=t.border||mix(tr,hexRgb(avgHex),0.82),link=t.link||accent;
		var reply=t.reply||accent,bookmark=t.bookmark||accent,like=t.like||"#f91880",repost=t.repost||"#00ba7c";
		return {
			"--xt-bg":fill(t.bg),"--xt-surface":fill(t.surface),"--xt-text":text,"--xt-secondary":t.secondary||mix(tr,hexRgb(avgHex),0.28),"--xt-muted":muted,"--xt-link":link,
			"--xt-border":border,"--xt-divider":t.divider||border,"--xt-accent":accent,"--xt-accent-fill":accentFill,"--xt-button":fill(t.button),"--xt-button-text":t.buttonText,
			"--xt-button-hover":t.buttonHover||mix(hexRgb(hexOf(t.button)),tr,0.12),"--xt-header":t.header?fill(t.header):"rgb("+Math.round(avg[0])+" "+Math.round(avg[1])+" "+Math.round(avg[2])+" / .85)",
			"--xt-hover":t.hover||("rgb("+tr[0]+" "+tr[1]+" "+tr[2]+" / .1)"),"--xt-input":t.inputBg||mix(hexRgb(surface),tr,0.08),"--xt-input-text":t.inputText||text,"--xt-input-border":t.inputBorder||border,
			"--xt-menu":t.menu?fill(t.menu):fill(t.surface),"--xt-tooltip":t.tooltip||mix(hexRgb(surface),tr,0.16),"--xt-icon":t.icon||muted,"--xt-icon-active":t.iconActive||text,
			"--xt-reply":reply,"--xt-repost":repost,"--xt-like":like,"--xt-bookmark":bookmark,"--xt-views":t.views||muted,
			"--xt-secondary-button":t.secondaryButton?fill(t.secondaryButton):"transparent","--xt-secondary-button-border":t.secondaryButtonBorder||border,"--xt-secondary-button-text":t.secondaryButtonText||text,
			"--xt-badge":t.badge||accent,"--xt-selection":t.selection||rgba(accent,0.28),"--xt-accent-soft":rgba(accent,0.1),"--xt-reply-soft":rgba(reply,0.1),"--xt-repost-soft":rgba(repost,0.1),"--xt-like-soft":rgba(like,0.1),"--xt-bookmark-soft":rgba(bookmark,0.1)
		};
	}
	function dropFonts(){document.querySelectorAll("link[data-xitter-font]").forEach(function(n){n.remove()})}
	function addFont(name){
		if(!fontOk(name))return;
		var slug=slugOf(name);
		if(document.querySelector('link[data-xitter-font="'+slug+'"]'))return;
		var l=document.createElement("link");
		l.rel="stylesheet";l.setAttribute("data-xitter-font",slug);l.href="/i/xitter/fonts/"+slug+"/fonts.css";
		document.head.appendChild(l);
	}
	function applyFonts(t){
		if(!fontSheet){fontSheet=document.createElement("style");fontSheet.setAttribute("data-xitter-font-css","");document.head.appendChild(fontSheet)}
		dropFonts();
		if(!t||!t.font){fontSheet.textContent="";return}
		var css="";
		if(fontOk(t.font.ui)){addFont(t.font.ui);css+='html[data-xitter-theme] body,html[data-xitter-theme] .css-146c3p1,html[data-xitter-theme] .css-1jxf684{font-family:"'+t.font.ui+'",'+CHIRP+'!important}'}
		if(fontOk(t.font.display)){addFont(t.font.display);css+='html[data-xitter-theme] [data-testid="User-Name"] span:first-of-type,html[data-xitter-theme] [data-testid="UserName"],html[data-xitter-theme] h1,html[data-xitter-theme] h2{font-family:"'+t.font.display+'",'+CHIRP+'!important}'}
		fontSheet.textContent=css;
	}
	var VAR_KEYS=["--xt-bg","--xt-surface","--xt-text","--xt-secondary","--xt-muted","--xt-link","--xt-border","--xt-divider","--xt-accent","--xt-accent-fill","--xt-button","--xt-button-text","--xt-button-hover","--xt-header","--xt-hover","--xt-input","--xt-input-text","--xt-input-border","--xt-menu","--xt-tooltip","--xt-icon","--xt-icon-active","--xt-reply","--xt-repost","--xt-like","--xt-bookmark","--xt-views","--xt-secondary-button","--xt-secondary-button-border","--xt-secondary-button-text","--xt-badge","--xt-selection","--xt-accent-soft","--xt-reply-soft","--xt-repost-soft","--xt-like-soft","--xt-bookmark-soft"];
	var ACCENT_KEYS={"--xt-accent":1,"--xt-accent-fill":1,"--xt-accent-soft":1,"--xt-accent-hover":1};
	function apply(t){
		theme=t;
		var h=document.documentElement;
		if(!t){
			h.removeAttribute("data-xitter-theme");
			VAR_KEYS.forEach(function(k){if(!ACCENT_KEYS[k])h.style.removeProperty(k)});
			if(sheet)sheet.textContent="";
			applyFonts(null);
			writeBase(false);
			key="";
			applyAccentVars();
			paintAccent();
			return;
		}
		h.setAttribute("data-xitter-theme",t.id||"custom");
		var v=varsOf(t),k;
		for(k in v)h.style.setProperty(k,v[k]);
		var sameBg=t.background&&X.theme&&X.theme.background&&t.background.mediaId&&t.background.mediaId===X.theme.background.mediaId;
		writeBase(!!sameBg);
		applyFonts(t);
		key="";
		applyAccentVars();
		paint();
		paintAccent();
	}
	function setNight(v){
		document.cookie="night_mode="+v+"; ${NIGHT_MODE_ATTR}";
	}
	function nudge(){
		if(!look)return;
		var digit=String(look.night);
		if((document.cookie.match(/(?:^|;\s*)night_mode=(\d)/)||[])[1]===digit)return;
		setNight(digit);
		try{if(sessionStorage.getItem("xitter-theme-nudge"))return;sessionStorage.setItem("xitter-theme-nudge","1")}catch(e){return}
		location.reload();
	}
	function norm(s){
		var m=/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/.exec(s||"");
		if(!m)return "";
		if(m[4]==null||m[4]===""||Number(m[4])===1)return m[1]+", "+m[2]+", "+m[3];
		return m[1]+", "+m[2]+", "+m[3]+", "+m[4];
	}
	function pal(){
		return theme&&theme.base==="light"?{
			bg:{"255, 255, 255":1},
			text:{"15, 20, 25":1},
			secondary:{"55, 67, 77":1},
			muted:{"83, 100, 113":1},
			border:{"239, 243, 244":1,"207, 217, 222":1,"185, 202, 211":1},
			surface:{"247, 249, 249":1},
			menu:{"255, 255, 255":1},
			header:{"255, 255, 255, 0.85":1},
			buttonBg:{"15, 20, 25":1},
			buttonText:{"255, 255, 255":1},
			hover:{"15, 20, 25, 0.1":1},
			input:{"239, 243, 244":1,"247, 249, 249":1},
			tooltip:{"15, 20, 25":1},
			icon:{"83, 100, 113":1},
			iconFill:{"83, 100, 113":1},
			iconActiveFill:{"15, 20, 25":1}
		}:{
			bg:{"0, 0, 0":1},
			text:{"231, 233, 234":1},
			secondary:{"182, 185, 188":1},
			muted:{"113, 118, 123":1,"89, 93, 98":1},
			border:{"47, 51, 54":1,"51, 54, 57":1,"62, 65, 68":1,"75, 78, 82":1},
			surface:{"22, 24, 28":1,"32, 35, 39":1},
			menu:{"32, 35, 39":1,"42, 45, 48":1},
			header:{"0, 0, 0, 0.65":1},
			buttonBg:{"239, 243, 244":1},
			buttonText:{"15, 20, 25":1},
			hover:{"231, 233, 234, 0.1":1,"255, 255, 255, 0.03":1},
			input:{"32, 35, 39":1},
			tooltip:{"39, 44, 48, 0.75":1},
			icon:{"113, 118, 123":1,"100, 105, 109":1},
			iconFill:{"100, 105, 109":1,"130, 154, 171":1},
			iconActiveFill:{"231, 233, 234":1}
		};
	}
	function wrap(sel, pageBg){
		var skip=sel+':not(img):not(svg[data-testid="icon-verified"]):not(svg[aria-label="Translator account"]):not(.xitter-deco):not([data-xitter-badges]):not([data-xitter-frame]):not([data-xitter-framed]):not([data-xitter-decor-bg]):not(:is(svg[data-testid="icon-verified"] *,svg[aria-label="Translator account"] *,[data-xitter-badges] *,[data-xitter-frame],[data-xitter-framed] *,[data-xitter-decor-bg] *,.xitter-deco,[aria-label="Color options"] *))';
		if(pageBg)return 'html[data-xitter-theme]:not([data-xitter-decor]) '+skip;
		return 'html[data-xitter-theme]:not([data-xitter-decor]) '+skip+',html[data-xitter-theme][data-xitter-decor] '+skip+':not([data-testid="primaryColumn"] *)';
	}
	function paint(){
		if(!theme||Date.now()-at<1000)return;
		at=Date.now();
		var p=pal(),found={pagebg:[],surface:[],text:[],secondary:[],muted:[],border:[],accentColor:[],accentBg:[],accentHover:[],accentSoft:[],accentOutline:[],button:[],buttonText:[],header:[],hover:[],menu:[],input:[],tooltip:[],icon:[],iconFill:[],iconActiveFill:[],repost:[],repostBg:[],like:[],likeBg:[],chirp:[]};
		function note(kind,sel){if(!found[kind])found[kind]=[];if(found[kind].indexOf(sel)<0)found[kind].push(sel)}
		[].forEach.call(document.styleSheets,function(ss){
			var rules;try{rules=ss.cssRules}catch(e){return}
			[].forEach.call(rules||[],function(r){
				if(!r.selectorText||!r.style||!/^\.[\w-]+$/.test(r.selectorText))return;
				var c=norm(r.style.color),bg=norm(r.style.backgroundColor),bd=norm(r.style.borderColor),fl=norm(r.style.fill),ol=norm(r.style.outlineColor),sel=r.selectorText;
				var ff=r.style.fontFamily||"";
				if(ff.indexOf("TwitterChirp")>=0)note("chirp",sel);
				if(p.bg[bg])note("pagebg",sel);
				if(p.surface[bg])note("surface",sel);
				if(p.menu[bg])note("menu",sel);
				if(p.header[bg])note("header",sel);
				if(p.buttonBg[bg])note("button",sel);
				if(p.hover[bg])note("hover",sel);
				if(p.input[bg])note("input",sel);
				if(p.tooltip[bg])note("tooltip",sel);
				if(p.text[c])note("text",sel);
				if(p.secondary[c])note("secondary",sel);
				if(p.muted[c])note("muted",sel);
				if(p.icon[c])note("icon",sel);
				if(p.buttonText[c]&&!p.text[c])note("buttonText",sel);
				if(c==="29, 155, 240"||c==="26, 140, 216")note("accentColor",sel);
				if(bg==="29, 155, 240")note("accentBg",sel);
				if(bg==="26, 140, 216")note("accentHover",sel);
				if(bg==="29, 155, 240, 0.1"||bg==="29, 155, 240, 0.12"||bg==="29, 155, 240, 0.14"||bg==="29, 155, 240, 0.2")note("accentSoft",sel);
				if(c==="0, 186, 124"||fl==="0, 186, 124")note("repost",sel);
				if(bg==="0, 186, 124"||bg==="0, 186, 124, 0.1"||bg==="0, 186, 124, 0.2")note("repostBg",sel);
				if(c==="249, 24, 128"||fl==="249, 24, 128")note("like",sel);
				if(bg==="249, 24, 128"||bg==="249, 24, 128, 0.1"||bg==="249, 24, 128, 0.2")note("likeBg",sel);
				if(p.border[bd])note("border",sel);
				if(fl==="29, 155, 240"||fl==="26, 140, 216")note("accentColor",sel);
				if(ol==="29, 155, 240")note("accentOutline",sel);
				if(p.iconFill[fl])note("iconFill",sel);
				if(p.iconActiveFill[fl])note("iconActiveFill",sel);
			});
		});
		var inline=[
			['text','[style*="color: rgb(231, 233, 234)"]','[style*="color: rgb(15, 20, 25)"]'],
			['muted','[style*="color: rgb(113, 118, 123)"]','[style*="color: rgb(83, 100, 113)"]'],
			['pagebg','[style*="background-color: rgb(0, 0, 0)"]','[style*="background-color: rgb(255, 255, 255)"]'],
			['surface','[style*="background-color: rgb(22, 24, 28)"]','[style*="background-color: rgb(32, 35, 39)"]','[style*="background-color: rgb(247, 249, 249)"]'],
			['button','[style*="background-color: rgb(239, 243, 244)"]','[style*="background-color: rgb(15, 20, 25)"]'],
			['accentColor','[style*="color: rgb(29, 155, 240)"]','[style*="fill: rgb(29, 155, 240)"]','[style*="color: rgb(26, 140, 216)"]'],
			['accentBg','[style*="background-color: rgb(29, 155, 240)"]'],
			['accentHover','[style*="background-color: rgb(26, 140, 216)"]'],
			['accentSoft','[style*="background-color: rgba(29, 155, 240, 0.1)"]','[style*="background-color: rgba(29, 155, 240, 0.12)"]','[style*="background-color: rgba(29, 155, 240, 0.2)"]'],
			['repost','[style*="color: rgb(0, 186, 124)"]'],
			['repostBg','[style*="background-color: rgb(0, 186, 124)"]','[style*="background-color: rgba(0, 186, 124, 0.1)"]'],
			['like','[style*="color: rgb(249, 24, 128)"]'],
			['likeBg','[style*="background-color: rgb(249, 24, 128)"]','[style*="background-color: rgba(249, 24, 128, 0.1)"]']
		];
		var light=theme.base==="light";
		inline.forEach(function(row){
			var kind=row[0];
			row.slice(1).forEach(function(sel){
				if(kind==="text"&&light&&sel.indexOf("15, 20, 25")>=0)note(kind,sel);
				else if(kind==="text"&&!light&&sel.indexOf("231, 233, 234")>=0)note(kind,sel);
				else if(kind==="muted"&&light&&sel.indexOf("83, 100, 113")>=0)note(kind,sel);
				else if(kind==="muted"&&!light&&sel.indexOf("113, 118, 123")>=0)note(kind,sel);
				else if(kind==="pagebg"&&light&&sel.indexOf("255, 255, 255")>=0)note(kind,sel);
				else if(kind==="pagebg"&&!light&&sel.indexOf("0, 0, 0")>=0)note(kind,sel);
				else if(kind==="surface")note(kind,sel);
				else if(kind==="button"&&light&&sel.indexOf("15, 20, 25")>=0)note(kind,sel);
				else if(kind==="button"&&!light&&sel.indexOf("239, 243, 244")>=0)note(kind,sel);
				else if(kind==="accentColor"||kind==="accentBg"||kind==="accentHover"||kind==="accentSoft"||kind==="repost"||kind==="repostBg"||kind==="like"||kind==="likeBg")note(kind,sel);
			});
		});
		var css=[],k;
		function add(kind,decl,pageBg){(found[kind]||[]).forEach(function(sel){css.push(wrap(sel,pageBg)+"{"+decl+"}")})}
		add("pagebg","background-color:transparent!important",true);
		add("surface","background:var(--xt-surface)!important",false);
		add("menu","background:var(--xt-menu)!important",false);
		add("header","background-color:var(--xt-header)!important",false);
		add("hover","background-color:var(--xt-hover)!important",false);
		add("input","background-color:var(--xt-input)!important;color:var(--xt-input-text)!important;border-color:var(--xt-input-border)!important",false);
		add("tooltip","background-color:var(--xt-tooltip)!important",false);
		add("text","color:var(--xt-text)!important",false);
		add("secondary","color:var(--xt-secondary)!important",false);
		add("muted","color:var(--xt-muted)!important",false);
		add("icon","color:var(--xt-icon)!important",false);
		add("iconFill","fill:var(--xt-icon)!important",false);
		add("iconActiveFill","fill:var(--xt-icon-active)!important",false);
		add("border","border-color:var(--xt-border)!important;border-bottom-color:var(--xt-divider)!important",false);
		add("button","background:var(--xt-button)!important",false);
		add("buttonText","color:var(--xt-button-text)!important",false);
		add("accentColor","color:var(--xt-accent)!important;fill:var(--xt-accent)!important",false);
		add("accentOutline","outline-color:var(--xt-accent)!important",false);
		add("accentBg","background:var(--xt-accent-fill,var(--xt-accent))!important",false);
		add("accentHover","background:var(--xt-accent-hover,var(--xt-accent))!important",false);
		add("accentSoft","background-color:var(--xt-accent-soft)!important",false);
		(found.accentColor||[]).forEach(function(sel){
			scopes.forEach(function(scope){
				css.push(wrap(scope+" "+sel)+"{color:var(--xt-link)!important}");
				css.push(wrap(scope+sel)+"{color:var(--xt-link)!important}");
			});
		});
		add("repost","color:var(--xt-repost)!important;fill:var(--xt-repost)!important",false);
		add("repostBg","background-color:var(--xt-repost-soft)!important",false);
		add("like","color:var(--xt-like)!important;fill:var(--xt-like)!important",false);
		add("likeBg","background-color:var(--xt-like-soft)!important",false);
		css.push('html[data-xitter-theme] [data-testid="reply"],html[data-xitter-theme] [data-testid="reply"] svg{color:var(--xt-reply)!important;fill:var(--xt-reply)!important}');
		css.push('html[data-xitter-theme] [data-testid="reply"]:hover [style*="background-color: rgba(29, 155, 240"]{background-color:var(--xt-reply-soft)!important}');
		css.push('html[data-xitter-theme] [data-testid="retweet"],html[data-xitter-theme] [data-testid="retweet"] svg{color:var(--xt-repost)!important;fill:var(--xt-repost)!important}');
		css.push('html[data-xitter-theme] [data-testid="like"],html[data-xitter-theme] [data-testid="like"] svg{color:var(--xt-like)!important;fill:var(--xt-like)!important}');
		css.push('html[data-xitter-theme] [data-testid="bookmark"],html[data-xitter-theme] [data-testid="bookmark"] svg,html[data-xitter-theme] [aria-label="Share post"] svg{color:var(--xt-bookmark)!important;fill:var(--xt-bookmark)!important}');
		css.push('html[data-xitter-theme] [data-testid="bookmark"]:hover [style*="background-color: rgba(29, 155, 240"],html[data-xitter-theme] [aria-label="Share post"]:hover [style*="background-color: rgba(29, 155, 240"]{background-color:var(--xt-bookmark-soft)!important}');
		css.push('html[data-xitter-theme] [data-testid="retweet"]:hover [style*="background-color: rgba(0, 186, 124"]{background-color:var(--xt-repost-soft)!important}');
		css.push('html[data-xitter-theme] [data-testid="like"]:hover [style*="background-color: rgba(249, 24, 128"]{background-color:var(--xt-like-soft)!important}');
		css.push('html[data-xitter-theme] [data-testid="app-text-transition-container"]{color:var(--xt-views)!important}');
		css.push('html[data-xitter-theme] a[href="/notifications"] div[dir],html[data-xitter-theme] [data-testid="AppTabBar_Notifications_Link"] div[style*="background"]{background-color:var(--xt-badge)!important}');
		css.push('html[data-xitter-theme] [data-testid="placementTracking"] button,html[data-xitter-theme] a[data-testid="editProfileButton"]{background:var(--xt-secondary-button)!important;border-color:var(--xt-secondary-button-border)!important;color:var(--xt-secondary-button-text)!important}');
		if(theme.font&&fontOk(theme.font.ui)){
			(found.chirp||[]).forEach(function(sel){css.push('html[data-xitter-theme] '+sel+'{font-family:"'+theme.font.ui+'",'+CHIRP+'!important}')});
		}
		var next=css.join("");
		if(next===key)return;
		key=next;
		if(!sheet){sheet=document.createElement("style");sheet.setAttribute("data-xitter-theme-css","");document.head.appendChild(sheet)}
		sheet.textContent=next;
	}
	function wrapAccent(sel){
		return 'html[data-xitter-accent] '+sel+':not(img):not(svg[data-testid="icon-verified"]):not(svg[aria-label="Translator account"]):not(.xitter-deco):not([data-xitter-badges]):not([data-xitter-frame]):not([data-xitter-framed]):not([data-xitter-decor-bg]):not(:is(svg[data-testid="icon-verified"] *,svg[aria-label="Translator account"] *,[data-xitter-badges] *,[data-xitter-frame],[data-xitter-framed] *,[data-xitter-decor-bg] *,.xitter-deco,[aria-label="Color options"] *))';
	}
	function paintAccent(){
		applyAccentVars();
		var css=[];
		function add(sel,decl){css.push(wrapAccent(sel)+"{"+decl+"}")}
		[].forEach.call(document.styleSheets,function(ss){
			var rules;try{rules=ss.cssRules}catch(e){return}
			[].forEach.call(rules||[],function(r){
				if(!r.selectorText||!r.style||!/^\.[\w-]+$/.test(r.selectorText))return;
				var c=norm(r.style.color),bg=norm(r.style.backgroundColor),fl=norm(r.style.fill),ol=norm(r.style.outlineColor),bd=norm(r.style.borderColor),sel=r.selectorText;
				if(c==="29, 155, 240"||c==="26, 140, 216"||fl==="29, 155, 240"||fl==="26, 140, 216")add(sel,"color:var(--xt-accent)!important;fill:var(--xt-accent)!important");
				if(bg==="29, 155, 240")add(sel,"background:var(--xt-accent-fill,var(--xt-accent))!important");
				if(bg==="26, 140, 216")add(sel,"background:var(--xt-accent-hover,var(--xt-accent))!important");
				if(bg==="142, 205, 248"||bg==="107, 201, 251")add(sel,"background-color:var(--xt-accent-tint)!important");
				if(/^29, 155, 240, /.test(bg)||/^26, 140, 216, /.test(bg))add(sel,"background-color:color-mix(in srgb,var(--xt-accent) "+Math.round(Number(bg.split(", ")[3])*100)+"%,transparent)!important");
				if(ol==="29, 155, 240"||bd==="29, 155, 240"||ol==="142, 205, 248"||bd==="142, 205, 248")add(sel,"outline-color:var(--xt-accent)!important;border-color:var(--xt-accent)!important");
				if(/29,\s*155,\s*240|26,\s*140,\s*216|142,\s*205,\s*248/.test(r.style.backgroundImage||""))add(sel,"background-image:linear-gradient(90deg,var(--xt-accent),var(--xt-accent-tint))!important");
			});
		});
		add('[style*="color: rgb(29, 155, 240)"]',"color:var(--xt-accent)!important;fill:var(--xt-accent)!important");
		add('[style*="fill: rgb(29, 155, 240)"]',"fill:var(--xt-accent)!important");
		add('[style*="background-color: rgb(29, 155, 240)"]',"background:var(--xt-accent-fill,var(--xt-accent))!important");
		add('[style*="background-color: rgb(26, 140, 216)"]',"background:var(--xt-accent-hover,var(--xt-accent))!important");
		add('[style*="background-color: rgba(29, 155, 240"]',"background-color:var(--xt-accent-soft)!important");
		add('[style*="border-color: rgb(29, 155, 240)"]',"border-color:var(--xt-accent)!important");
		add('[style*="border-color: rgb(26, 140, 216)"]',"border-color:var(--xt-accent-hover,var(--xt-accent))!important");
		add('[style*="background-color: rgb(142, 205, 248)"]',"background-color:var(--xt-accent-tint)!important");
		css.push('html[data-xitter-accent] [data-testid="tweetButton"],html[data-xitter-accent] [data-testid="tweetButtonInline"]{background:var(--xt-accent-fill,var(--xt-accent))!important;border-color:transparent!important}');
		css.push('html[data-xitter-accent] [data-testid="tweetButton"] div,html[data-xitter-accent] [data-testid="tweetButtonInline"] div{color:var(--xt-accent-text,#fff)!important}');
		var next=css.join("");
		if(next!==accentKey){
			accentKey=next;
			if(!accentSheet){accentSheet=document.createElement("style");accentSheet.setAttribute("data-xitter-accent-css","");document.head.appendChild(accentSheet)}
			accentSheet.textContent=next;
		}
		paintChecks();
	}
	function post(body,then){
		fetch("/i/api/xitter/theme",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf()},body:JSON.stringify(body)})
			.then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
			.then(function(x){if(then)then(x.ok,x.d)},function(){});
	}
	function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e}
	function chipBg(g){return g&&g.stops?fill(g):"#15202b"}
	var wired=false,picking=false;
	function circle(card){var r=card.querySelector('[role="radio"]');return r&&r.firstElementChild}
	function unselectCard(card){
		card.style.borderColor="rgb(51, 54, 57)";
		card.style.borderWidth="1px";
		var d=circle(card);
		if(d){d.style.backgroundColor="rgba(0, 0, 0, 0)";d.style.borderColor="rgb(185, 202, 211)";d.innerHTML=""}
		var i=card.querySelector("input");if(i)i.checked=false;
	}
	function selectCard(card){
		var acc=resolved.solid||"#1d9bf0";
		card.style.borderColor=acc;
		card.style.borderWidth="2px";
		var d=circle(card);
		if(d){d.style.backgroundColor=acc;d.style.borderColor=acc;if(!d.querySelector("svg"))d.innerHTML=TICK}
		var i=card.querySelector("input");if(i)i.checked=true;
	}
	function mark(){
		var dim=document.querySelector("[data-xitter-dim]");
		document.querySelectorAll("[data-xitter-native]").forEach(function(c){
			if(theme)unselectCard(c);
			else{
				var i=c.querySelector("input");
				if(i&&i.checked)selectCard(c);
			}
		});
		if(dim){
			if(theme&&theme.id==="dim")selectCard(dim);
			else if(theme)unselectCard(dim);
			else{
				var i=dim.querySelector("input");
				if(i&&i.checked)selectCard(dim);
			}
			dim.setAttribute("data-on",theme&&theme.id==="dim"?"1":"0");
		}
		document.querySelectorAll("[data-xitter-swatch]").forEach(function(c){
			var on=theme&&theme.id===c.getAttribute("data-xitter-swatch");
			c.setAttribute("data-on",on?"1":"0");
			c.style.borderColor=on?(resolved.solid||"#1d9bf0"):"transparent";
		});
	}
	function markColors(group){
		var a=resolveAccent(accentWire),on=a.custom?"custom":a.id;
		group.setAttribute("data-custom",a.custom?"1":"0");
		group.querySelectorAll("[data-xitter-color]").forEach(function(card){
			var id=card.getAttribute("data-xitter-color");
			var sel=id===on;
			var radio=card.querySelector("input[type=radio]");
			if(radio)radio.checked=!!sel;
			card.querySelectorAll("svg").forEach(function(s){
				if(s.querySelector("circle")&&!s.querySelector("path")){
					if(id==="custom")s.style.display="none";
					return;
				}
				if(id!=="custom")s.style.display=sel?"":"none";
			});
			if(id==="custom"){
				var host=card.querySelector('[role="radio"]')||card;
				var tick=card.querySelector("[data-xitter-tick]");
				if(sel){
					if(!tick){
						tick=document.createElement("div");
						tick.setAttribute("data-xitter-tick","");
						tick.innerHTML=TICK;
						tick.style.cssText="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none";
						var svg=tick.querySelector("svg");
						if(svg)svg.style.cssText="width:25px;height:25px;fill:#fff";
						host.style.position="relative";
						host.appendChild(tick);
					}
				}else if(tick)tick.remove();
			}
		});
	}
	function openCustom(group){
		var inp=document.getElementById("xitter-accent-pick");
		if(!inp){
			inp=document.createElement("input");
			inp.type="color";inp.id="xitter-accent-pick";
			inp.style.cssText="position:fixed;left:-99px;width:1px;height:1px;opacity:0";
			document.body.appendChild(inp);
			inp.addEventListener("input",function(){
				if(!inp.value)return;
				forcedColor="blue500";
				accentWire=inp.value;
				applyAccentVars();
				paintAccent();
				markColors(group);
			});
			inp.addEventListener("change",function(){
				post({accent:inp.value},function(ok,d){
					if(ok&&d&&d.accent!=null)accentWire=d.accent;
					if(ok&&d&&d.theme)theme=d.theme;
					applyAccentVars();
					paintAccent();
					markColors(group);
				});
			});
		}
		var a=resolveAccent(accentWire);
		inp.value=/^#[0-9a-f]{6}$/i.test(a.solid)?a.solid:"#ff3d7f";
		inp.click();
	}
	function colors(){
		if(location.pathname.indexOf("/settings/display")!==0)return;
		var group=document.querySelector('[role="radiogroup"][aria-label="Color options"]');
		if(!group)return;
		var kids=[].filter.call(group.children,function(n){return n.getAttribute("data-xitter-color")!=="custom"&&n.querySelector('[role="radio"],input[type="radio"]')});
		kids.forEach(function(card,i){
			var id=accentIds[i];
			if(!id)return;
			if(card.getAttribute("data-xitter-wired"))return;
			card.setAttribute("data-xitter-wired","1");
			card.setAttribute("data-xitter-color",id);
			card.addEventListener("click",function(){
				if(picking)return;
				forcedColor=id;
				accentWire=id;
				post({accent:id},function(ok,d){
					if(ok&&d&&d.accent!=null)accentWire=d.accent;
					if(ok&&d&&d.theme)theme=d.theme;
					applyAccentVars();
					paintAccent();
					markColors(group);
				});
			},true);
		});
		if(!group.querySelector('[data-xitter-color="custom"]')){
			var last=kids[kids.length-1]||group.lastElementChild;
			if(last){
				var custom=last.cloneNode(true);
				custom.removeAttribute("data-xitter-wired");
				custom.setAttribute("data-xitter-color","custom");
				var lab=custom.querySelector("input");
				if(lab){lab.setAttribute("aria-label","Custom");lab.checked=false;lab.name="xitter-accent-custom"}
				var vis=custom.querySelector('[role="radio"]')||custom.firstElementChild;
				if(vis){
					vis.style.background="conic-gradient(#ff3d7f,#ffd400,#00ba7c,#1d9bf0,#7856ff,#f91880,#ff3d7f)";
					vis.style.borderRadius="9999px";
					vis.style.backgroundImage="conic-gradient(#ff3d7f,#ffd400,#00ba7c,#1d9bf0,#7856ff,#f91880,#ff3d7f)";
				}
				var disc=custom.querySelector("svg");
				if(disc)disc.style.display="none";
				custom.addEventListener("click",function(e){
					e.preventDefault();e.stopPropagation();
					if(picking)return;
					picking=true;
					var blue=group.querySelector('[data-xitter-color="blue500"]');
					try{if(blue)blue.click()}catch(err){}
					picking=false;
					forcedColor="blue500";
					openCustom(group);
				},true);
				group.appendChild(custom);
			}
		}
		markColors(group);
	}
	function display(){
		if(location.pathname.indexOf("/settings/display")!==0)return;
		colors();
		if(document.querySelector("[data-xitter-dim]")){mark();return}
		var group=document.querySelector('[role="radiogroup"][aria-label="Background options"]');
		if(!group)return;
		var defCard,lightsCard,i;
		for(i=0;i<group.children.length;i++){
			var card=group.children[i],lab=card.querySelector("span"),tx=lab&&lab.textContent;
			if(tx==="Default")defCard=card;
			if(tx==="Lights out")lightsCard=card;
		}
		if(!defCard||!lightsCard)return;
		defCard.setAttribute("data-xitter-native","default");
		lightsCard.setAttribute("data-xitter-native","lights");
		var dim=lightsCard.cloneNode(true);
		dim.setAttribute("data-xitter-dim","");
		dim.removeAttribute("data-xitter-native");
		dim.querySelectorAll("span").forEach(function(s){if(!s.childElementCount&&s.textContent==="Lights out")s.textContent="Dim"});
		dim.style.backgroundColor="#15202B";
		var inp=dim.querySelector("input");
		if(inp){inp.removeAttribute("name");inp.setAttribute("aria-label","Dim");inp.checked=false}
		unselectCard(dim);
		group.insertBefore(dim,lightsCard);
		function onMode(mode){
			return function(){
				if(picking)return;
				post({mode:mode},function(){apply(null);mark()});
			};
		}
		defCard.addEventListener("click",onMode("light"),true);
		lightsCard.addEventListener("click",onMode("dark"),true);
		dim.addEventListener("click",function(e){
			e.preventDefault();e.stopPropagation();
			picking=true;
			var lightsInp=lightsCard.querySelector("input");
			try{(lightsInp||lightsCard).click()}catch(err){}
			picking=false;
			post({theme:{id:"dim"}},function(ok,d){
				if(ok&&d&&d.theme)apply(d.theme);else apply({id:"dim",base:"dark",bg:{stops:["#15202b"],angle:180},surface:"#1e2732",text:"#f7f9f9",accent:"#1d9bf0",button:{stops:["#eff3f4"],angle:180},buttonText:"#0f1419",muted:"#8b98a5",border:"#38444d"});
				mark();
			});
		},true);
		var face=CHIRP, muted="rgb(113, 118, 123)", accent=resolved.solid||"#1d9bf0";
		var sample=defCard.querySelector("span")||defCard;
		var fam=getComputedStyle(sample).fontFamily;
		if(fam&&!/^\s*(serif|Times|Times New Roman)\s*$/i.test(fam))face=fam;
		var rootAcc=getComputedStyle(document.documentElement).getPropertyValue("--xt-accent").trim();
		if(rootAcc)accent=rootAcc;
		else{
			var ring=getComputedStyle(dim).borderColor;
			if(ring&&ring!=="rgb(51, 54, 57)"&&ring!=="rgba(0, 0, 0, 0)")accent=ring;
		}
		var n,spans=document.querySelectorAll("span");
		for(n=0;n<spans.length;n++){
			if(/Manage your font size/.test(spans[n].textContent||"")){muted=getComputedStyle(spans[n]).color;break}
		}
		var bar=el("div");
		bar.setAttribute("data-xitter-themes","");
		bar.style.cssText="display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 16px;box-sizing:border-box;width:100%;font-family:"+face+";font-size:15px;line-height:20px";
		var lab=el("span","","Custom themes");
		lab.style.cssText="font-family:inherit;font-size:15px;line-height:20px;color:"+muted+";margin:0";
		bar.appendChild(lab);
		presets.forEach(function(p){
			var b=el("button");
			b.type="button";
			b.title=p.name||p.id;
			b.setAttribute("data-xitter-swatch",p.id);
			b.setAttribute("aria-label",p.name||p.id);
			b.style.cssText="width:30px;height:30px;min-width:30px;min-height:30px;border-radius:9999px;border:2px solid transparent;padding:0;margin:0;cursor:pointer;background:"+chipBg(p.bg)+";flex:none;font-family:inherit;appearance:none;-webkit-appearance:none";
			b.addEventListener("click",function(){
				post({theme:{id:p.id}},function(){location.reload()});
			});
			bar.appendChild(b);
		});
		var a=el("a","","Customize…");
		a.href="/account/theme";
		a.style.cssText="font-family:inherit;font-size:15px;line-height:20px;color:"+accent+";text-decoration:none;margin:0";
		a.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();location.assign("/account/theme")},true);
		bar.appendChild(a);
		var host=group.parentElement;
		if(host&&host.parentNode)host.parentNode.insertBefore(bar,host.nextSibling);
		if(!wired){
			wired=true;
			var st=document.createElement("style");
			st.textContent='[data-xitter-themes] a{text-decoration:none}[data-xitter-themes] a:hover{text-decoration:underline}[data-xitter-swatch][data-on="1"]{border-color:var(--xt-accent,'+accent+')!important}';
			document.head.appendChild(st);
		}
		mark();
	}
	var base=document.createElement("style");
	base.setAttribute("data-xitter-theme-base","");
	function writeBase(on){
		base.textContent='html[data-xitter-theme] ::selection{background:var(--xt-selection)}'+
			'html[data-xitter-theme]:not([data-xitter-decor]),html[data-xitter-theme]:not([data-xitter-decor]) body{background:var(--xt-bg)!important;background-attachment:fixed!important}'+
			'html[data-xitter-theme]:not([data-xitter-decor]) #react-root>div>div,html[data-xitter-theme]:not([data-xitter-decor]) #react-root>div>div>div:not([data-testid]){background-color:transparent!important}'+
			(on&&typeof X.pageChrome==="string"?X.pageChrome:"html[data-xitter-theme]{--xt-bg-image:none;--xt-bg-still:none}");
	}
	writeBase(!!(theme&&theme.background));
	document.head.appendChild(base);
	seedThemeColor();
	applyAccentVars();
	if(theme)apply(theme);
	else paintAccent();
	nudge();
	function tick(){if(theme)paint();paintAccent();display()}
	tick();
	new MutationObserver(function(){if(!timer)timer=setTimeout(function(){timer=null;tick()},150)}).observe(document.documentElement,{childList:true,subtree:true});
})();`;
