(function() {
    if (window.turboV35_Parallel) {
        // Agar pehle se chal raha hai toh purana button uda do taaki naya lag sake
        const oldBtn = document.getElementById('turbo-toast-controller');
        if (oldBtn) oldBtn.remove();
    }
    window.turboV35_Parallel = true;
   
    let data = [];
    let nameMapping = JSON.parse(localStorage.getItem('turbo_name_mapping') || '{}');
    let genderMapping = JSON.parse(localStorage.getItem('turbo_gender_mapping') || '{}');
    let historyQty = JSON.parse(localStorage.getItem('turbo_rank_history') || '{}');
    let idleTimestamps = JSON.parse(localStorage.getItem('turbo_idle_timers') || '{}');
    let totalIdleAccumulator = JSON.parse(localStorage.getItem('turbo_total_idle_time') || '{}');
   
    let completionTimes = {};
    let lastGlobalTotal = 0;
    const MAX_WORKERS = 4;
    const TARGET_URL = "http://10.24.1.71/flo-lite/gur_san_wh_nl_01nl/v2/desktop/ncob/transfer-list";
    const BOX_DETAILS_URL = "http://10.24.1.71/flo-lite/gur_san_wh_nl_01nl/v2/desktop/ncob/box-details";
   
    const TOAST_AVATARS = {
        female: 'https://lh3.googleusercontent.com/d/1QiuNgzBWO59acinHPYw_UPef9U3kREFo',
        male: 'https://lh3.googleusercontent.com/d/1Hy30sSv8W7HxqZW3u172acUzdwrLDhPl'
    };

    window.packedTotal = window.packedTotal || 0;
    window.openedTotal = window.openedTotal || 0;

    // Strict Global Flag for Toast Control
    window.isToastStrictlyEnabled = true;

    function getMappedName(id) {
        if (!id || id === '-' || id === ' ') return "Unassigned";
        const cleanId = id.toLowerCase().trim();
        return nameMapping[cleanId] || id.toUpperCase();
    }

    function isSimilar(s1, s2, threshold = 0.5) {
        if (!s1 || !s2) return false;
        s1 = s1.toLowerCase().trim();
        s2 = s2.toLowerCase().trim();
        if (s1.includes(s2) || s2.includes(s1)) return true;
        const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
        for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
        for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
        for (let j = 1; j <= s2.length; j += 1) {
            for (let i = 1; i <= s1.length; i += 1) {
                const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
                track[j][i] = Math.min(track[j - 1][i] + 1, track[j][i - 1] + 1, track[j - 1][i - 1] + indicator);
            }
        }
        const distance = track[s2.length][s1.length];
        const maxLength = Math.max(s1.length, s2.length);
        return (maxLength - distance) / maxLength >= threshold;
    }

    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        :root { --bg-grad: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%); --card-bg: #ffffff; --text-main: #1e293b; --text-sub: #64748b; --border: #e2e8f0; --header-bg: rgba(255, 255, 255, 0.8); --glass: rgba(255, 255, 255, 0.5); --footer-bg: #ebedee; }
        .dark-version { --bg-grad: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); --card-bg: #1e293b; --text-main: #f1f5f9; --text-sub: #94a3b8; --border: #334155; --header-bg: rgba(15, 23, 42, 0.9); --glass: rgba(30, 41, 59, 0.5); --footer-bg: #0f172a; }
        #turbo-app { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: var(--bg-grad); z-index: 100000; color: var(--text-main); font-family: 'Inter', sans-serif; display: flex; flex-direction: column; overflow: hidden; }
        .t-header { background: var(--header-bg); backdrop-filter: blur(12px); padding: 10px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
        .summary-bar { display: flex; gap: 15px; background: var(--header-bg); padding: 10px 25px; border-bottom: 1px solid var(--border); justify-content: center; flex-wrap: wrap; }
        .sum-item { text-align: center; min-width: 110px; border-right: 1px solid var(--border); padding: 0 10px; }
        .sum-item:last-child { border-right: none; }
        .sum-val { display: block; font-size: 20px; font-weight: 900; color: #3b82f6; }
        .sum-lbl { font-size: 9px; font-weight: 800; color: var(--text-sub); text-transform: uppercase; }
        .t-grid { display: flex; flex: 1; gap: 15px; padding: 15px; overflow-x: auto; padding-bottom: 40px;}
        .t-col { flex: 1; min-width: 280px; background: var(--glass); border-radius: 15px; border: 1px solid var(--border); display: flex; flex-direction: column; }
        .t-col-h { padding: 12px; font-size: 11px; font-weight: 800; text-align: center; border-bottom: 1px solid var(--border); color: var(--text-sub); letter-spacing: 1px; }
        .t-scroll { flex: 1; overflow-y: auto; padding: 10px; }
        .t-card { background: var(--card-bg); border-radius: 12px; padding: 14px; margin-bottom: 12px; border: 1px solid var(--border); position: relative; }
        .progress-container { height: 6px; background: var(--border); border-radius: 10px; margin: 10px 0; overflow: hidden; }
        .progress-bar { height: 100%; background: #3b82f6; transition: width 0.4s; }
        .id-text { color: var(--text-main); font-size: 14px; font-weight: 800; }
        .lbl { color: var(--text-sub); font-weight: 600; font-size: 9px; text-transform: uppercase; }
        .val { color: var(--text-main); font-weight: 700; font-size: 12px; }
        .p-qty { font-size: 20px; color: #ef4444; font-weight: 900; line-height: 1; }
        .done-time { color: #ff0000; font-size: 11px; font-weight: 800; margin-top: 2px; }
        .search-input { background: var(--card-bg); border: 1px solid var(--border); color: var(--text-main); padding: 5px 12px; border-radius: 20px; font-size: 12px; outline: none; width: 180px; margin-right: 10px; transition: all 0.3s;}
        .voice-active { border: 2px solid #10b981 !important; box-shadow: 0 0 15px rgba(16, 185, 129, 0.5); background: #ecfdf5 !important; color: #064e3b !important; }
        .voice-standby { border: 2px solid #64748b !important; }
        .rank-item { display: flex; flex-direction: column; padding: 10px; margin-bottom: 8px; border-radius: 10px; font-size: 12px; font-weight: 700; border: 1px solid rgba(0,0,0,0.1); color: #fff; text-shadow: 0px 1px 2px rgba(0,0,0,0.3); }
        .rank-row { display: flex; justify-content: space-between; align-items: center; }
        .emp-name { font-size: 10px; color: #fff; font-weight: 600; margin-top: 2px; opacity: 0.9; }
        .total-idle-val { font-size: 9px; opacity: 0.85; font-weight: 800; margin-top: -2px; text-align: right; letter-spacing: 0.5px; }
        .arrow-box { padding: 2px 6px; border-radius: 4px; font-weight: 900; margin-left: 5px; min-width: 20px; text-align: center;}
        .arrow-up { background: #dcfce7; color: #15803d; }
        .arrow-down { background: #fee2e2; color: #b91c1c; }
        .arrow-none { background: #f1f5f9; color: #94a3b8; }
        .timer-badge { font-family: monospace; background: #334155; color: #fff; padding: 2px 5px; border-radius: 4px; font-size: 10px; margin-top: 5px; display: inline-block;}
        .btn-main { background: #3b82f6; color: white; padding: 8px 15px; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; }
        .btn-assign { background: #10b981; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; cursor: pointer; margin-top: 5px; width: 100%; text-transform: uppercase; }
        .btn-theme { background: var(--border); color: var(--text-main); padding: 8px; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; margin-right:5px; }
       
        #floating-avatar-wrap { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 2147483647; font-family: 'Arial Black', sans-serif; backdrop-filter: blur(8px); }
        .top-right-badge { position: absolute; top: 40px; right: 40px; width: 100px; height: 100px; border-radius: 50%; background: gold; border: 4px solid #fff; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 30px rgba(255,215,0,0.6); z-index: 2; }
        .badge-text { font-size: 40px; font-weight: 900; color: #000; }
        .floating-content { text-align: center; transform: scale(0.5); opacity: 0; transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); position: relative; z-index: 2; }
        .floating-content.active { opacity: 1; transform: scale(1); }
        .floating-content img { width: 250px; height: 250px; border-radius: 50%; border: 10px solid #3b82f6; box-shadow: 0 0 50px rgba(59,130,246,0.8); margin-bottom: 20px; object-fit: cover; background: #fff; }
        .user-name-toast { font-size: 60px; font-weight: 900; color: #fff; text-transform: uppercase; text-shadow: 0 10px 20px rgba(0,0,0,0.5); margin-bottom: 10px; }
        .qty-toast { font-size: 40px; color: #10b981; font-weight: 900; border: 3px solid #10b981; padding: 5px 25px; border-radius: 50px; display: inline-block; background: rgba(0,0,0,0.3); }

        .t-footer { position: fixed; bottom: 0; width: 100%; height: 20px; background: var(--bg-grad); display: flex; align-items: center; justify-content: center; font-size: 10px; z-index: 100001; pointer-events: none; }
        #worker-pit { position: absolute; top: -5000px; left: -5000px; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
        #mega-blast-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
    `;
    document.head.appendChild(style);

    const app = document.createElement('div');
    app.id = 'turbo-app';
    app.innerHTML = `
        <div class="t-header">
            <span style="font-size:18px; font-weight:900;">Seller Merge <span style="color:#3b82f6">TL Monitor Pro</span></span>
            <div>
                <input type="text" id="turbo-filter" class="search-input voice-standby" placeholder="Say 'System Online'...">
                <span id="sync-status" style="font-size:10px; margin-right:15px; color:#10b981; font-weight:bold;">SCANNING...</span>
                <button id="theme-toggle" class="btn-theme"> MODE</button>
                <input type="file" id="csv-upload" style="display:none" accept=".csv">
                <button id="btn-upload-trigger" class="btn-main" style="background:#8b5cf6">UPLOAD NAMES</button>
                <button id="dl-csv" class="btn-main" style="background:#64748b">CSV</button>
                <button id="add-btn" class="btn-main">+ ADD IDs</button>
                <button onclick="location.reload()" style="background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer; margin-left:10px">EXIT</button>
            </div>
        </div>
        <div class="summary-bar">
            <div class="sum-item"><span id="sum-opened" class="sum-val" style="color:#ff9800">0</span><span class="sum-lbl">Opened Tasks</span></div>
            <div class="sum-item"><span id="sum-packed" class="sum-val" style="color:#4caf50">0</span><span class="sum-lbl">Packing Pending</span></div>
            <div class="sum-item"><span id="sum-live" class="sum-val">0</span><span class="sum-lbl">Live Pending</span></div>
            <div class="sum-item"><span id="sum-pend" class="sum-val">0</span><span class="sum-lbl">Queued Pending</span></div>
            <div class="sum-item"><span id="sum-ipp" class="sum-val" style="color:#10b981">0</span><span class="sum-lbl">Total IPP</span></div>
        </div>
        <div class="t-grid">
            <div class="t-col" style="background:rgba(245,158,11,0.05)"><div class="t-col-h" style="background:#f59e0b; color:white">UNASSIGNED</div><div id="c-unassigned" class="t-scroll"></div></div>
            <div class="t-col"><div class="t-col-h">ACTIVE</div><div id="c-live" class="t-scroll"></div></div>
            <div class="t-col"><div class="t-col-h">QUEUED</div><div id="c-pending" class="t-scroll"></div></div>
            <div class="t-col"><div class="t-col-h">DONE</div><div id="c-done" class="t-scroll"></div></div>
            <div class="t-col"><div class="t-col-h">RANKING</div><div id="c-rank" class="t-scroll"></div></div>
            <div class="t-col" style="background:rgba(239,68,68,0.05)"><div class="t-col-h" style="background:#ef4444; color:white">IDLE TIME</div><div id="c-idle" class="t-scroll"></div></div>
        </div>
        <div class="t-footer">Develop By saveseven</div>
        <div id="worker-pit"></div>
    `;
    document.body.appendChild(app);

    function fireMegaBlast(parentElement) {
        const canvas = document.createElement('canvas');
        canvas.id = 'mega-blast-canvas';
        parentElement.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        canvas.width = parentElement.clientWidth || window.innerWidth; 
        canvas.height = parentElement.clientHeight || window.innerHeight;
        let particles = [];
        for (let i = 0; i < 150; i++) {
            particles.push({
                x: canvas.width / 2, y: canvas.height / 2,
                vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
                size: Math.random() * 10 + 5,
                color: ['#3b82f6', '#ffffff', '#ffd700'][Math.floor(Math.random() * 3)],
                alpha: 1
            });
        }
        function animate() {
            if (!document.getElementById('mega-blast-canvas')) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i];
                p.x += p.vx; p.y += p.vy; p.alpha *= 0.95;
                ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
                if (p.alpha < 0.05) particles.splice(i, 1);
            }
            if (particles.length > 0) requestAnimationFrame(animate); else canvas.remove();
        }
        animate();
    }

    function showToast(cid, rankNum, totalQty) {
        // HARD STOP CHECK: Agar switch off hai to function yahi band ho jaye
        if (window.isToastStrictlyEnabled === false) {
            console.log(`Blocked Toast via hard-stop: ${cid}`);
            return;
        }

        const cleanId = cid.toLowerCase().trim();
        const gender = (genderMapping[cleanId] || 'male').toLowerCase();
        const name = nameMapping[cleanId] || cid.toUpperCase();
        const avatar = TOAST_AVATARS[gender] || TOAST_AVATARS.male;

        const old = document.getElementById('floating-avatar-wrap');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'floating-avatar-wrap';
        overlay.innerHTML = `
            <div class="top-right-badge">
                <div class="badge-text">#${rankNum}</div>
            </div>
            <div class="floating-content">
                <img src="${avatar}">
                <div class="user-name-toast">${name}</div>
                <div style="color: #cbd5e1; font-size: 20px; margin-bottom:15px;">${cid.toUpperCase()}</div>
                <div class="qty-toast">${totalQty} QTY PACKED</div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        fireMegaBlast(overlay);

        setTimeout(() => overlay.querySelector('.floating-content').classList.add('active'), 100);
       
        speak(`${name} ne ${totalQty} quantity ke sath rank ${rankNum} haasil kar li hai.`);

        setTimeout(() => { if(overlay) {
            overlay.querySelector('.floating-content').classList.remove('active');
            setTimeout(() => overlay.remove(), 600);
        }}, 5000);
    }

    const filterInput = document.getElementById('turbo-filter');
    let isSystemActive = false;

    function speak(text) {
        if (window.isToastStrictlyEnabled === false) return; // Voice safety block
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'hi-IN';
        window.speechSynthesis.speak(msg);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let voiceText = event.results[0][0].transcript.toLowerCase().trim();
           
            if (isSimilar(voiceText, "system online") || isSimilar(voiceText, "online")) {
                isSystemActive = true;
                filterInput.classList.replace('voice-standby', 'voice-active');
                filterInput.placeholder = "Listening for name...";
                speak("Sir, main ready hoon filter karne ke liye");
                return;
            }

            if (isSystemActive) {
                if (isSimilar(voiceText, "clear") || isSimilar(voiceText, "reset")) {
                    filterInput.value = "";
                } else {
                    filterInput.value = voiceText;
                }
               
                refreshUI();
                speak("Sir, ye raha aapka result");
               
                isSystemActive = false;
                filterInput.classList.replace('voice-active', 'voice-standby');
                filterInput.placeholder = "Say 'System Online'...";
            }
        };

        recognition.onend = () => {
            recognition.start();
        };

        recognition.start();
    }

    function formatDuration(ms) {
        if (!ms || ms < 0) return "0s";
        let s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
        if (h > 0) return `${h}h ${m % 60}m`;
        if (m > 0) return `${m}m ${s % 60}s`;
        return `${s}s`;
    }

    function getRankColor(index, total) {
        if (total <= 1) return '#10b981';
        const ratio = index / (total - 1);
        const r = Math.floor(16 + (ratio * (239 - 16))), g = Math.floor(185 + (ratio * (68 - 185))), b = Math.floor(129 + (ratio * (68 - 129)));
        return `rgb(${r}, ${g}, ${b})`;
    }

    function refreshUI() {
        const live = document.getElementById('c-live'), pend = document.getElementById('c-pending'), done = document.getElementById('c-done'), rank = document.getElementById('c-rank'), idle = document.getElementById('c-idle'), unassigned = document.getElementById('c-unassigned');
        const sLive = document.getElementById('sum-live'), sPend = document.getElementById('sum-pend'), sIpp = document.getElementById('sum-ipp'), sOpened = document.getElementById('sum-opened'), sPacked = document.getElementById('sum-packed');
        const searchTerm = filterInput.value.toLowerCase().trim();
       
        live.innerHTML = pend.innerHTML = done.innerHTML = rank.innerHTML = idle.innerHTML = unassigned.innerHTML = '';
        let stats = {}, activeCaspers = new Set(), allCaspers = new Set(), queuedCounts = {};
        let totalLivePending = 0, totalQueuedPending = 0, currentGlobalTotal = 0;
       
        sOpened.innerText = window.openedTotal;
        sPacked.innerText = window.packedTotal;

        data.forEach(x => {
            const qty = parseInt(x.q) || 0, picked = parseInt(x.pq) || 0, remaining = Math.max(0, qty - picked);
            const progress = qty > 0 ? Math.min((picked / qty) * 100, 100) : 0;
            const statusStr = (x.s || '').toLowerCase();
            const isDone = statusStr.includes('completed');
            const isStarted = statusStr.includes('started');
            const isUnassigned = (!x.ci || x.ci === '-' || x.ci === ' ') && !isDone;
           
            if (isStarted && !completionTimes[x.id]) completionTimes[x.id] = { start: Date.now() };
            if (isDone && completionTimes[x.id] && !completionTimes[x.id].end) {
                completionTimes[x.id].end = Date.now();
                completionTimes[x.id].total = formatDuration(completionTimes[x.id].end - completionTimes[x.id].start);
            }

            if (x.ci && x.ci.toLowerCase().includes('ca.')) {
                const cid = x.ci.toLowerCase().trim();
                allCaspers.add(cid);
                if (isStarted) { activeCaspers.add(cid); delete idleTimestamps[cid]; }
                else if (!isDone) queuedCounts[cid] = (queuedCounts[cid] || 0) + 1;
                stats[cid] = (stats[cid] || 0) + picked;
                currentGlobalTotal += picked;
            }

            const eName = getMappedName(x.ci);
            if (!searchTerm || isSimilar(x.id, searchTerm) || isSimilar(x.ci, searchTerm) || isSimilar(eName, searchTerm)) {
                let assignBtn = isUnassigned ? `<button class="btn-assign" onclick="window.open('${TARGET_URL}?search=${x.id}', '_blank')">Assign Task</button>` : '';
                let timeInfo = (isDone && completionTimes[x.id]?.total) ? `<div class="done-time">${completionTimes[x.id].total}</div>` : '';
                let cardHtml = `<div class="t-card"><div style="display:flex; justify-content:space-between"><span class="id-text">${x.id}</span><span class="lbl" style="color:#3b82f6">${x.s}</span></div><div style="margin-top:5px; display:flex; justify-content:space-between"><div><span class="lbl">User:</span> <span class="val">${eName}</span></div><div style="text-align:right"><span class="lbl">Zone:</span> <span class="val" style="font-size:10px">${x.pz}</span></div></div><div class="progress-container"><div class="progress-bar" style="width:${progress}%; background:${isDone?'#10b981':'#3b82f6'}"></div></div><div style="display:flex; justify-content:space-between; align-items:center"><div><div class="lbl">Remain</div><div class="p-qty">${remaining}</div>${timeInfo}</div><div style="text-align:right"><div class="val">${picked} / ${qty}</div><div class="lbl">Picked</div></div></div>${assignBtn}</div>`;
                if (isUnassigned) unassigned.innerHTML += cardHtml;
                else if (isDone) done.innerHTML += cardHtml;
                else if (isStarted) { live.innerHTML += cardHtml; totalLivePending += remaining; }
                else { pend.innerHTML += cardHtml; totalQueuedPending += remaining; }
            }
        });

        const sortedStats = Object.entries(stats).sort((a,b) => b[1] - a[1]);
        
        // LOOP TOAST FIRE CONDITION (Strict check inside the logic loop)
        if (currentGlobalTotal > lastGlobalTotal && lastGlobalTotal !== 0) {
            sortedStats.forEach(([cid, pQty], i) => {
                if (historyQty[cid] !== undefined && pQty > historyQty[cid]) {
                    if (window.isToastStrictlyEnabled === true) { 
                        showToast(cid, i + 1, pQty);
                    }
                }
            });
        }
        lastGlobalTotal = currentGlobalTotal;
        sLive.innerText = totalLivePending; sPend.innerText = totalQueuedPending; sIpp.innerText = currentGlobalTotal;

        sortedStats.forEach(([cid, pQty], i) => {
            const eName = getMappedName(cid);
            if (!searchTerm || isSimilar(cid, searchTerm) || isSimilar(eName, searchTerm)) {
                const bgColor = getRankColor(i, sortedStats.length);
                const totalIdleTime = formatDuration(totalIdleAccumulator[cid] || 0);
                let arrowHtml = '<span class="arrow-box arrow-none">●</span>';
                if (historyQty[cid] !== undefined) {
                    if (pQty > historyQty[cid]) arrowHtml = '<span class="arrow-box arrow-up">▲</span>';
                    else if (pQty < historyQty[cid]) arrowHtml = '<span class="arrow-box arrow-down">▼</span>';
                }
                rank.innerHTML += `<div class="rank-item" style="background:${bgColor}"><div class="rank-row"><span>#${i+1} ${cid.toUpperCase()}</span><div style="display:flex; flex-direction:column; align-items:flex-end;"><div style="display:flex; align-items:center;"><b>${pQty} Qty</b> ${arrowHtml}</div><div class="total-idle-val">Idle: ${totalIdleTime}</div></div></div><div class="emp-name">${eName}</div></div>`;
            }
            historyQty[cid] = pQty;
        });

        allCaspers.forEach(cid => {
            if (!activeCaspers.has(cid)) {
                if (!idleTimestamps[cid]) idleTimestamps[cid] = Date.now();
                totalIdleAccumulator[cid] = (totalIdleAccumulator[cid] || 0) + 1000;
                const eName = getMappedName(cid);
                if (!searchTerm || isSimilar(cid, searchTerm) || isSimilar(eName, searchTerm)) {
                    let qCount = queuedCounts[cid] || 0;
                    let displayDuration = formatDuration(Date.now() - idleTimestamps[cid]);
                    idle.innerHTML += `<div class="rank-item" style="background:#475569; border-left:4px solid ${qCount > 0 ? '#10b981' : '#ef4444'}"><div class="rank-row"><span>${cid.toUpperCase()}</span><b>${qCount > 0 ? 'ASSIGNED: '+qCount : 'ASSIGNED: 0'}</b></div><div class="emp-name">${eName}</div><div class="timer-badge">Idle: ${displayDuration}</div></div>`;
                }
            }
        });
        localStorage.setItem('turbo_total_idle_time', JSON.stringify(totalIdleAccumulator));
        localStorage.setItem('turbo_idle_timers', JSON.stringify(idleTimestamps));
        localStorage.setItem('turbo_rank_history', JSON.stringify(historyQty));
    }

    document.getElementById('btn-upload-trigger').onclick = () => document.getElementById('csv-upload').click();
    document.getElementById('csv-upload').onchange = function(e) {
        const reader = new FileReader();
        reader.onload = function(event) {
            event.target.result.split('\n').forEach(line => {
                const cols = line.split(',');
                if (cols.length >= 2) {
                    const id = cols[0].trim().toLowerCase();
                    if (id.includes('ca.')) {
                        nameMapping[id] = cols[1].trim();
                        if (cols[2]) genderMapping[id] = cols[2].trim().toLowerCase();
                    }
                }
            });
            localStorage.setItem('turbo_name_mapping', JSON.stringify(nameMapping));
            localStorage.setItem('turbo_gender_mapping', JSON.stringify(genderMapping));
            alert("Database Updated!");
            refreshUI();
        };
        reader.readAsText(e.target.files[0]);
    };

    const workerPit = document.getElementById('worker-pit');
    for(let i=0; i < MAX_WORKERS; i++) {
        const ifr = document.createElement('iframe');
        ifr.id = `worker-${i}`; ifr.src = TARGET_URL; workerPit.appendChild(ifr);
    }
    const boxWorker = document.createElement('iframe');
    boxWorker.id = `worker-4`; boxWorker.src = BOX_DETAILS_URL; workerPit.appendChild(boxWorker);

    document.getElementById('theme-toggle').onclick = () => app.classList.toggle('dark-version');
    const getElementByXpath = (doc, path) => doc.evaluate(path, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

    async function fetchDataFromWorker(workerIdx, id) {
        const ifr = document.getElementById(`worker-${workerIdx}`);
        const doc = ifr.contentWindow.document;
        const win = ifr.contentWindow;
        try {
            const input = doc.querySelector('#ncob-transfer-list-search');
            if (!input) return null;
            input.focus(); input.value = '';
            win.document.execCommand('insertText', false, id + '0');
            await new Promise(r => setTimeout(r, 200));
            input.setSelectionRange(input.value.length - 1, input.value.length);
            win.document.execCommand('delete', false);
            await new Promise(r => setTimeout(r, 450));
            const btn = doc.querySelector('.hunkdo') || doc.querySelector('[class*="SearchText"]');
            if (btn) btn.click();
            await new Promise(r => setTimeout(r, 1600));
            const row = Array.from(doc.querySelectorAll('tr')).find(r => r.innerText.includes(id));
            if (row) {
                const td = row.querySelectorAll('td');
                return { q: td[3]?.innerText.trim() || '0', pq: td[4]?.innerText.trim() || '0', s: td[9]?.innerText.trim() || 'WAIT', ci: td[10]?.innerText.trim() || '-', pz: td[12]?.innerText.trim() || '-' };
            }
        } catch(e) {} return null;
    }

    async function startScanCycle(statusName, checkboxXpath) {
        const ifr = document.getElementById('worker-4');
        const doc = ifr.contentWindow.document;
        const clickWait = (xpath, time = 1000) => new Promise(r => {
            const el = getElementByXpath(doc, xpath);
            if (el) { el.click(); setTimeout(r, time); } else r();
        });
        await clickWait("/html/body/div[1]/div/div/div/div[2]/div/div[1]/div[2]/div[1]/div[2]/div[2]/button/div[2]");
        await clickWait("/html/body/div[7]/div/div/div[2]/label");
        await clickWait("/html/body/div[1]/div/div/div/div[2]/div/div[2]/div[2]/div[2]/div[1]/button");
        const cb = getElementByXpath(doc, checkboxXpath);
        if (cb && !cb.checked) cb.click();
        await clickWait("/html/body/div[1]/div/div/div/div[2]/div/div[2]/div[2]/div[3]/button/span", 2500);
        let tempSum = 0, hasMore = true;
        while (hasMore) {
            const rows = doc.querySelectorAll('table tbody tr');
            rows.forEach(row => {
                const qtyCell = row.cells[2];
                if (qtyCell) {
                    const val = parseInt(qtyCell.innerText.trim());
                    if (!isNaN(val)) tempSum += val;
                }
            });
            const nextBtn = getElementByXpath(doc, "(/html/body/div[1]/div/div/div/div[2]/div/div[5]/div[1]/div/button)[last()]");
            if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled')) {
                nextBtn.click(); await new Promise(r => setTimeout(r, 2000));
            } else hasMore = false;
        }
        if (statusName === "PACKED") window.packedTotal = tempSum;
        if (statusName === "OPENED") window.openedTotal = tempSum;
        refreshUI();
        await clickWait("/html/body/div[1]/div/div/div/div[2]/div/div[1]/div[2]/div[1]/div[2]/div[2]/button/div[2]");
        await clickWait("/html/body/div[1]/div/div/div/div[2]/div/div[2]/div[2]/div[2]/div[1]/button");
        const cbClear = getElementByXpath(doc, checkboxXpath);
        if (cbClear && cbClear.checked) cbClear.click();
        await clickWait("/html/body/div[1]/div/div/div/div[2]/div/div[2]/div[2]/div[3]/button/span", 1000);
    }

    document.getElementById('add-btn').onclick = () => {
        const val = prompt("Paste TL IDs:");
        if (val) val.split(/[\n, ]+/).filter(s => s.length > 5).forEach(id => {
            if (!data.find(x => x.id === id)) data.push({id, s:'QUEUED', q:'0', pq:'0', ci:'-', pz:'-', ts:Date.now()});
        });
        refreshUI();
    };

    // -----------------------------------------------------
    // FLOATING UI TOGGLE BUTTON DIRECT INTEGRATION
    // -----------------------------------------------------
    const uiBtn = document.createElement('button');
    uiBtn.id = 'turbo-toast-controller';
    uiBtn.innerHTML = '🔊 TOAST: ON';
    
    uiBtn.style.position = 'fixed';
    uiBtn.style.bottom = '30px';
    uiBtn.style.right = '20px';
    uiBtn.style.zIndex = '2147483647';
    uiBtn.style.padding = '10px 20px';
    uiBtn.style.fontSize = '12px';
    uiBtn.style.fontWeight = 'bold';
    uiBtn.style.fontFamily = "'Inter', sans-serif";
    uiBtn.style.color = '#ffffff';
    uiBtn.style.backgroundColor = '#10b981'; // Green for ON
    uiBtn.style.border = 'none';
    uiBtn.style.borderRadius = '30px';
    uiBtn.style.cursor = 'pointer';
    uiBtn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    uiBtn.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    uiBtn.onmouseover = () => uiBtn.style.transform = 'scale(1.08)';
    uiBtn.onmouseout = () => uiBtn.style.transform = 'scale(1)';

    uiBtn.onclick = function() {
        if (window.isToastStrictlyEnabled) {
            window.isToastStrictlyEnabled = false;
            uiBtn.innerHTML = '🔇 TOAST: OFF';
            uiBtn.style.backgroundColor = '#ef4444'; // Red for OFF
            uiBtn.style.boxShadow = '0 6px 20px rgba(239,68,68,0.4)';
            console.log("🔴 System MUTED. No toasts will pass through.");
        } else {
            window.isToastStrictlyEnabled = true;
            uiBtn.innerHTML = '🔊 TOAST: ON';
            uiBtn.style.backgroundColor = '#10b981'; // Green for ON
            uiBtn.style.boxShadow = '0 6px 20px rgba(16,185,129,0.4)';
            console.log("🟢 System UNMUTED. Toasts enabled.");
        }
    };

    document.body.appendChild(uiBtn);
    // -----------------------------------------------------

    (async function engine() {
        while (document.getElementById('turbo-app')) {
            let activeTasks = data.filter(x => !x.s.toLowerCase().includes('completed'));
            for (let i = 0; i < activeTasks.length; i += MAX_WORKERS) {
                const batch = activeTasks.slice(i, i + MAX_WORKERS);
                await Promise.all(batch.map(async (item, index) => {
                    const res = await fetchDataFromWorker(index, item.id);
                    if (res) { Object.assign(item, res); refreshUI(); }
                }));
            }
            await new Promise(r => setTimeout(r, 3000));
        }
    })();

    (async function boxEngine() {
        while (document.getElementById('turbo-app')) {
            try {
                await startScanCycle("PACKED", "/html/body/div[1]/div/div/div/div[2]/div/div[2]/div[2]/div[2]/div[1]/div/div/div/div/div[4]/ul/li[7]/div/div/input");
                await startScanCycle("OPENED", "/html/body/div[1]/div/div/div/div[2]/div/div[2]/div[2]/div[2]/div[1]/div/div/div/div/div[4]/ul/li[1]/div/div/input");
                document.getElementById('sync-status').innerText = "LAST SYNC: " + new Date().toLocaleTimeString();
                await new Promise(r => setTimeout(r, 10000));
            } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
        }
    })();

    document.getElementById('dl-csv').onclick = () => {
        let csv = "TL ID,Status,Quantity,Picked Qty,User ID,Pickzone\n";
        data.forEach(x => { csv += `${x.id},${x.s},${x.q},${x.pq},${x.ci},${x.pz}\n`; });
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = `TL_Report_${new Date().toLocaleDateString()}.csv`;
        link.click();
    };
})();
