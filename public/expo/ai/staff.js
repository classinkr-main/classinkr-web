(function(){const MODE_KEY=`booth-demo-mode`,FS_KEY=`booth-fullscreen`,IDLE_KEY=`booth-idle`;const COVER_KEY=`booth-cover`,FILM_SOUND_KEY=`booth-film-sound`,ROBOT_SOUND_KEY=`booth-robot-sound`;const SYNC_KEY=`booth-sync`,OFFSET_KEY=`booth-sync-offset`;const inApp=/ClassInBoothApp/.test(navigator.userAgent);const get=k=>{try{return localStorage.getItem(k)}catch(e){return null}};const put=(k,v)=>{try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}};const MODES={watch:`Plays every feature by itself, like a video. Nobody needs to tap.`,guided:`Plays by itself and waits for the visitor at the key step.`,handson:`The visitor taps every step. The screen shows where to tap.`};window.BoothDemoMode=MODES[get(MODE_KEY)]?get(MODE_KEY):`guided`;const idleNow=()=>get(IDLE_KEY)===`off`?`off`:get(IDLE_KEY)===`60`?`60`:`40`;window.BoothIdle={ms:()=>({off:0,60:6e4,40:4e4})[idleNow()]};const isFull=()=>window.BoothScreen.isFull();const enterFull=()=>window.BoothScreen.enter();const fsOn=()=>!inApp&&get(FS_KEY)===`1`;const markFs=()=>document.documentElement.classList.toggle(`booth-fs`,fsOn());markFs();let fsHeld=false;document.addEventListener(`click`,()=>{if(fsOn()&&!fsHeld)enterFull()},true);function toggleFull(){if(isFull()){fsHeld=true;window.BoothScreen.exit()}else{fsHeld=false;enterFull()}}const css=`
#staff{position:absolute;left:50%;top:50%;z-index:300;width:1760px;transform:translate(-50%,-50%);box-sizing:border-box;
  padding:40px 46px 34px;border-radius:32px;background:#fff;color:#1b2624;font-family:Gilroy,"Segoe UI",sans-serif;
  box-shadow:0 0 0 9999px rgba(8,24,18,.45),0 30px 80px rgba(0,0,0,.4)}
#staff .hd{display:flex;align-items:center;justify-content:space-between}
#staff .hd b{font-size:40px;font-weight:700;letter-spacing:-.01em}
#staff .x{width:64px;height:64px;border:0;border-radius:50%;background:#eef3f1;color:#33433e;font:700 30px/1 Gilroy,"Segoe UI",sans-serif;cursor:pointer}
#staff .cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 48px}
#staff .sublab{margin:16px 2px 8px;font-size:21px;font-weight:700;color:#33433e}
#staff .sublab:first-of-type{margin-top:0}
#staff .nudge{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
#staff .nudge output{grid-column:1/-1;order:-1}
#staff .nudge button{height:60px;border:2px solid #d5e3dd;border-radius:16px;background:#fff;color:#33433e;font:700 24px/1 Gilroy,"Segoe UI",sans-serif;cursor:pointer}
#staff .nudge output{flex:1;text-align:center;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
#staff .clock{margin-top:12px;padding:12px 16px;border-radius:14px;background:#eef6f2;font-size:22px;font-weight:600;color:#1b2624;font-variant-numeric:tabular-nums}
#staff section{margin-top:30px}
#staff h3{margin:0 0 12px;font-size:20px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#00734F}
#staff .seg{display:flex;gap:10px}
#staff .seg button{flex:1;height:72px;border:2px solid #d5e3dd;border-radius:18px;background:#fff;color:#33433e;
  font:600 26px/1 Gilroy,"Segoe UI",sans-serif;cursor:pointer}
#staff .seg button.on{background:#00734F;border-color:#00734F;color:#fff}
#staff p{margin:12px 2px 0;font-size:21px;line-height:1.35;color:#4a5b55}
#staff .test{margin-top:14px;height:60px;padding:0 30px;border:2px solid #00734F;border-radius:999px;background:#fff;
  color:#00734F;font:700 24px/1 Gilroy,"Segoe UI",sans-serif;cursor:pointer}
#staff .foot{margin-top:30px;font-size:19px;color:#6d7f78;text-align:center}
#staff .tabs{display:flex;gap:6px;margin-left:auto;margin-right:28px;padding:6px;border-radius:999px;background:#eef3f1}
#staff .tabs button{height:60px;padding:0 30px;border:0;border-radius:999px;background:transparent;color:#33433e;font:700 24px/1 Gilroy,"Segoe UI",sans-serif;cursor:pointer}
#staff .tabs button.on{background:#00734F;color:#fff}
#staff .panes{min-height:560px}
#staff .panes > .cols{display:none}
#staff .panes > .cols.on{display:grid}
#staff .vnote:empty{display:none}`;let panel=null;function seg(name,opts){return`<div class="seg" data-k="${name}">`+opts.map(([v,t])=>`<button type="button" data-v="${v}">${t}</button>`).join(``)+`</div>`}function open(){if(panel)return;if(!document.getElementById(`staffcss`)){const s=document.createElement(`style`);s.id=`staffcss`;s.textContent=css;document.head.appendChild(s)}panel=document.createElement(`div`);panel.id=`staff`;panel.setAttribute(`role`,`dialog`);panel.setAttribute(`aria-label`,`Staff settings`);panel.innerHTML=`
      <div class="hd"><b>Staff settings</b>
        <div class="tabs" role="tablist"><button type="button" role="tab" data-tab="kiosk">Kiosk</button><button type="button" role="tab" data-tab="film">Film and sound</button><button type="button" role="tab" data-tab="robot">Robot</button></div>
        <button class="x" type="button" aria-label="Close">✕</button></div>
      <div class="panes">
      <div class="cols" data-pane="kiosk"><div>
        ${inApp?``:`<section><h3>Full screen</h3>${seg(`fs`,[[`off`,`Off`],[`on`,`On`]])}
          <p>On: the first tap fills the screen, and it stays that way. The full-screen button is hidden, so visitors can't close it.</p></section>`}
      </div><div>
        <section><h3>Back to the film</h3>${seg(`idle`,[[`40`,`After 40 s`],[`60`,`After 60 s`],[`off`,`Off`]])}
          <p>When nobody touches the screen, the demo goes back to the idle film.</p></section>
      </div><div>
        <section><h3>Demo mode</h3>${seg(`mode`,[[`watch`,`Watch`],[`guided`,`Guided`],[`handson`,`Hands-on`]])}
          <p class="desc"></p></section>
      </div></div>
      <div class="cols" data-pane="film"><div>
        <section><h3>Idle film</h3>${seg(`cover`,[[`ai`,`AI Classroom`],[`whatis`,`What is ClassIn`]])}
          <p>The film that plays when nobody is using the screen.</p></section>
      </div><div>
        <section><h3>Film sound</h3>${seg(`filmsound`,[[`off`,`Off`],[`low`,`Low`],[`mid`,`Medium`],[`high`,`High`]])}
          <p>The film is heard after the first tap on the screen, and only while it is showing.</p></section>
      </div><div>
        <section><h3>Two screens in sync</h3>${seg(`sync`,[[`off`,`Off`],[`on`,`On`]])}
          <p>On: every screen set to On shows the same moment of the film, using its own clock. No internet needed.</p>
          <div class="nudge"><output class="off"></output><button type="button" data-nudge="-10">&minus;10 s</button><button type="button" data-nudge="-1">&minus;1 s</button><button type="button" data-nudge="1">+1 s</button><button type="button" data-nudge="10">+10 s</button><button type="button" data-nudge="-0.1">&minus;0.1 s</button><button type="button" data-nudge="0" title="Back to 0">0</button><button type="button" data-nudge="0.1">+0.1 s</button></div>
          <p class="clock"></p></section>
      </div></div>
      <div class="cols" data-pane="robot"><div>
        <section><h3>Robot mascot</h3>${seg(`robot`,[[`off`,`Off`],[`on`,`On`]])}
          <p>Uses the TV camera to greet visitors on the idle screen.</p>
          <button class="test" type="button">Camera test</button></section>
      </div><div>
        <section><h3>Robot sound</h3>
          <p class="sublab">Style</p>${seg(`robotstyle`,[[`playful`,`Playful`],[`gentle`,`Gentle`],[`voice`,`Voice`]])}
          <p class="sublab">Volume</p>${seg(`robotvol`,[[`off`,`Off`],[`low`,`Low`],[`mid`,`Medium`],[`high`,`High`]])}
          <p class="sublab">Pitch</p>${seg(`robotpitch`,[[`lower`,`Lower`],[`normal`,`Normal`],[`higher`,`Higher`]])}
          <button class="test sndtest" type="button">Test the sound</button>
          <p class="vnote"></p></section>
      </div><div>
        <section><h3>Robot behaviour</h3>
          <p class="sublab">Asks people to tap the screen</p>${seg(`robotcall`,[[`8`,`Every 8 s`],[`15`,`15 s`],[`30`,`30 s`],[`60`,`60 s`]])}
          <p class="sublab">Knocks on the glass</p>${seg(`robotknock`,[[`on`,`On`],[`off`,`Off`]])}
          <p class="sublab">Speech bubbles</p>${seg(`robotbubble`,[[`on`,`On`],[`off`,`Off`]])}</section>
      </div></div>
      </div>
      <p class="foot">Top-right corner: 2 quick taps switch full screen on or off, 4 quick taps open or close these settings.</p>`;(document.getElementById(`stage`)||document.body).appendChild(panel);[`pointerdown`,`pointerup`,`click`,`touchstart`].forEach(ev=>panel.addEventListener(ev,e=>e.stopPropagation()));panel.querySelector(`.x`).addEventListener(`click`,close);panel.querySelector(`.test`).addEventListener(`click`,()=>{if(window.BoothRobot)window.BoothRobot.test()});panel.querySelector(`.sndtest`).addEventListener(`click`,()=>import(`./robot/chirps.js`).then(m=>m.test()));panel.querySelectorAll(`[data-tab]`).forEach(b=>b.addEventListener(`click`,()=>{tab=b.dataset.tab;refresh()}));if(`speechSynthesis`in window)speechSynthesis.addEventListener(`voiceschanged`,refresh);panel.addEventListener(`click`,e=>{const n=e.target.closest(`[data-nudge]`);if(n){const step=parseFloat(n.dataset.nudge);const off=step===0?0:Math.round(((parseFloat(get(OFFSET_KEY))||0)+step)*10)/10;put(OFFSET_KEY,off?String(off):null);window.BoothFilm.align();return refresh()}const b=e.target.closest(`.seg button`);if(!b)return;const k=b.parentNode.dataset.k,v=b.dataset.v;if(k===`cover`){put(COVER_KEY,v===`ai`?null:v);window.BoothFilm.setCover(v)}if(k===`filmsound`){put(FILM_SOUND_KEY,v);window.BoothFilm.sound()}if(k===`robotstyle`)put(`booth-robot-style`,v===`playful`?null:v);if(k===`robotvol`){put(`booth-robot-volume`,v===`high`?null:v);put(ROBOT_SOUND_KEY,null);if(window.BoothChirps)window.BoothChirps.apply()}if(k===`robotpitch`)put(`booth-robot-pitch`,v===`normal`?null:v);if(k===`robotcall`)put(`booth-robot-call`,v===`8`?null:v);if(k===`robotknock`)put(`booth-robot-knock`,v===`on`?null:`off`);if(k===`robotbubble`)put(`booth-robot-bubble`,v===`on`?null:`off`);if(k===`sync`){put(SYNC_KEY,v===`on`?`on`:null);window.BoothFilm.align()}if(k===`mode`){window.BoothDemoMode=v;put(MODE_KEY,v)}if(k===`idle`)put(IDLE_KEY,v===`40`?null:v);if(k===`fs`){put(FS_KEY,v===`on`?`1`:null);markFs();if(v===`on`)enterFull();else window.BoothScreen.exit()}if(k===`robot`&&window.BoothRobot){Promise.resolve(window.BoothRobot.turn(v===`on`)).then(refresh)}refresh()});[`fullscreenchange`,`webkitfullscreenchange`].forEach(ev=>document.addEventListener(ev,refresh));refresh();const clock=panel.querySelector(`.clock`);const mmss=s=>`${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4,`0`)}`;tick=setInterval(()=>{const[t,d]=window.BoothFilm.time();clock.textContent=`Film ${mmss(t)} of ${mmss(d)} · clock ${new Date().toLocaleTimeString(`en-GB`)}`},100)}let tick=0,tab=`kiosk`;function refresh(){if(!panel)return;const robotOn=!!(window.BoothRobot&&window.BoothRobot.alive());const now={mode:window.BoothDemoMode,fs:get(FS_KEY)===`1`?`on`:`off`,robot:robotOn?`on`:`off`,idle:idleNow(),cover:window.BoothFilm.cover(),filmsound:get(FILM_SOUND_KEY)||`mid`,sync:get(SYNC_KEY)===`on`?`on`:`off`,robotstyle:get(`booth-robot-style`)||`playful`,robotpitch:get(`booth-robot-pitch`)||`normal`,robotvol:get(ROBOT_SOUND_KEY)===`off`?`off`:get(`booth-robot-volume`)||`high`,robotcall:get(`booth-robot-call`)||`8`,robotknock:get(`booth-robot-knock`)===`off`?`off`:`on`,robotbubble:get(`booth-robot-bubble`)===`off`?`off`:`on`};panel.querySelectorAll(`[data-tab]`).forEach(b=>{b.classList.toggle(`on`,b.dataset.tab===tab);b.setAttribute(`aria-selected`,String(b.dataset.tab===tab))});panel.querySelectorAll(`[data-pane]`).forEach(p=>p.classList.toggle(`on`,p.dataset.pane===tab));const voices=`speechSynthesis`in window&&speechSynthesis.getVoices().some(x=>/^en/i.test(x.lang));panel.querySelector(`.vnote`).textContent=now.robotstyle!==`voice`?``:voices?`Voice: the robot says its lines aloud in this device's English voice.`:`This device has no English voice, so in Voice style the robot only chirps.`;const off=parseFloat(get(OFFSET_KEY))||0;panel.querySelector(`.nudge output`).textContent=`This screen moved by ${off>0?`+`:``}${off.toFixed(1)} s`;panel.querySelector(`.nudge`).style.display=now.sync===`on`?``:`none`;panel.querySelectorAll(`.seg`).forEach(s=>s.querySelectorAll(`button`).forEach(b=>{b.classList.toggle(`on`,b.dataset.v===now[s.dataset.k]);b.setAttribute(`aria-pressed`,String(b.dataset.v===now[s.dataset.k]))}));panel.querySelector(`.desc`).textContent=MODES[window.BoothDemoMode];panel.querySelector(`.test`).style.display=robotOn?``:`none`}function close(){if(!panel)return;clearInterval(tick);[`fullscreenchange`,`webkitfullscreenchange`].forEach(ev=>document.removeEventListener(ev,refresh));panel.remove();panel=null}window.BoothStaff={open,close,toggle:()=>panel?close():open(),toggleFull}})();