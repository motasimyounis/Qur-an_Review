// ====================================================================================
// عنوان: تطبيق مراجعة القرآن الكريم
// الوصف: تطبيق ويب تفاعلي لمتابعة مراجعة القرآن، يشمل عرض الصفحات، تتبع مرات المراجعة، إضافة ملاحظات،
//         وإدارة المهام اليومية، بالإضافة إلى تقويم لتتبع التقدم.
// ====================================================================================

(() => {
  // ==================== المتغيرات والثوابت الأساسية ====================
// 🕒 Stopwatch Variables
let stopwatchSeconds = 0;
let stopwatchInterval;

// 🕒 بدء العداد بمجرد تحميل الصفحة
window.addEventListener("load", () => {
  startStopwatch();
});

function startStopwatch() {
  stopwatchInterval = setInterval(() => {
    stopwatchSeconds++;
    document.getElementById("stopwatchTime").textContent = formatTime(stopwatchSeconds);
  }, 1000);
}

function formatTime(sec) {
  let hours = String(Math.floor(sec / 3600)).padStart(2, '0');
  let minutes = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  let seconds = String(sec % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

  // تحديد نوع المصحف (عادي أو تجويد) من الذاكرة المحلية
  let mushafType = localStorage.getItem("mushafType") || "tajweed";

  // إنشاء مصفوفة (Array) تحتوي على نطاقات الصفحات لكل جزء من القرآن (من 1 إلى 30)
  const parts = Array.from({length: 30}, (_, i) => {
    const start = i * 20 + 2;
    const end = i === 29 ? 604 : start + 19;
    return [start, end];
  });
  
  // تحميل بيانات عداد المراجعات والملاحظات من الذاكرة المحلية
  const counts = JSON.parse(localStorage.getItem("counts") || "{}");
  const notes = JSON.parse(localStorage.getItem("notes") || "{}");
  
  // تحميل قيمة الهدف (عدد مرات المراجعة المطلوبة للصفحة)
  let target = parseInt(localStorage.getItem("target") || "10");
  
  // تحديد الجزء الحالي الذي يظهر للمستخدم
  let current = parseInt(localStorage.getItem("lastPart") || "0");
  
  // متغيرات لتتبع الصفحات والحالة
  let highlightedPage = null;
  let currentImagePage = null;

// ==================== قاعدة بيانات IndexedDB ====================
let db;
const request = indexedDB.open("QuranReviewDB", 1);

request.onupgradeneeded = function(e) {
  db = e.target.result;
  db.createObjectStore("audioStore", { keyPath: "page" });
};

request.onsuccess = function(e) {
  db = e.target.result;
};

request.onerror = function(e) {
  console.error("❌ IndexedDB Error:", e);
};
// 🎙️ تسجيل الصوت
let mediaRecorder;
let audioChunks = {};
let audioPlayer = new Audio();

// حفظ تسجيل في IndexedDB
function saveAudio(page, blob) {
  const transaction = db.transaction(["audioStore"], "readwrite");
  const store = transaction.objectStore("audioStore");
  store.put({ page: page, audio: blob });
}

// تحميل تسجيل لصفحة
function loadAudio(page, callback) {
  const transaction = db.transaction(["audioStore"], "readonly");
  const store = transaction.objectStore("audioStore");
  const request = store.get(page);

  request.onsuccess = function() {
    if (request.result) {
      callback(URL.createObjectURL(request.result.audio));
    } else {
      callback(null);
    }
  };
}

// حذف تسجيل صفحة
function deleteAudio(page) {
  const transaction = db.transaction(["audioStore"], "readwrite");
  const store = transaction.objectStore("audioStore");
  store.delete(page);
}

// حذف جميع التسجيلات
function clearAllAudio() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["audioStore"], "readwrite");
    const store = transaction.objectStore("audioStore");
    const req = store.clear();

    req.onsuccess = () => {
      console.log("🗑️ تم مسح جميع التسجيلات");
      resolve();
    };
    req.onerror = (e) => {
      console.error("❌ خطأ أثناء المسح:", e);
      reject(e);
    };
  });
}
// ✅ عنصر التحكم بسرعة الصوت
const speedControl = document.getElementById("speedControl");
if (speedControl) {
  speedControl.addEventListener("change", () => {
    audioPlayer.playbackRate = parseFloat(speedControl.value);
    console.log("🎵 سرعة التشغيل:", audioPlayer.playbackRate);
  });
}

// عناصر التحكم
const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const playBtn = document.getElementById("playBtn");
const deleteAudioBtn = document.getElementById("deleteAudioBtn");

// تحديث الأزرار حسب وجود تسجيل
function updateAudioControls(page) {
  if (!page) {
    playBtn.disabled = true;
    deleteAudioBtn.disabled = true;
    return;
  }

  loadAudio(page, (src) => {
    if (src) {
      playBtn.disabled = false;
      deleteAudioBtn.disabled = false;
    } else {
      playBtn.disabled = true;
      deleteAudioBtn.disabled = true;
    }
  });
}

// بدء التسجيل
// بدء التسجيل
recordBtn.onclick = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("❌ المتصفح لا يدعم التسجيل الصوتي");
    return;
  }
  
  try {
    // 🎤 طلب الوصول إلى الميكروفون
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // إنشاء MediaRecorder بعد الحصول على الإذن
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 256000
    });

    audioChunks[currentImagePage] = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) {
        audioChunks[currentImagePage].push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks[currentImagePage], { type: "audio/webm" });
      saveAudio(currentImagePage, blob);
      updateAudioControls(currentImagePage);
      loadAudio(currentImagePage, (src) => {
    if (src) {
      audioPlayer.src = src;
      playBtn.disabled = false;
      deleteAudioBtn.disabled = false;
    }
  });
    };

    mediaRecorder.start();
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    alert("✅ بدأ التسجيل");

  } catch (err) {
    // 🚫 التعامل مع الأخطاء أو رفض المستخدم
    console.error("❌ فشل الوصول للميكروفون:", err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      alert("⚠️ يجب السماح بالوصول للميكروفون لتتمكن من التسجيل.");
    } else {
      alert(`❌ حدث خطأ: ${err.message}`);
    }
  }
};
// إيقاف التسجيل
stopBtn.onclick = () => {
  mediaRecorder.stop();
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  alert("✅ تم حفظ التسجيل بنجاح!");
};

// تشغيل التسجيل
// تشغيل/إيقاف مؤقت للتسجيل
playBtn.onclick = () => {
  // لو في ملف مُحمَّل بالفعل
  if (audioPlayer.src) {
    if (audioPlayer.paused) {
      // 🔊 لو متوقف مؤقت → نكمل من حيث توقف
      audioPlayer.play();
      playBtn.textContent = "⏸️ إيقاف ";
    } else {
      // ⏸️ لو شغال → نوقف مؤقت
      audioPlayer.pause();
      playBtn.textContent = "▶️ تشغيل";
    }
  } else {
    // 📂 لو مفيش تسجيل مُحمَّل → نحمله ونشغله من البداية
    loadAudio(currentImagePage, (src) => {
      if (src) {
        audioPlayer.src = src;
        audioPlayer.play();
        playBtn.textContent = "⏸️ إيقاف ";
      }
    });
  }
};

// لما ينتهي الصوت يرجع الزر لحالته الأصلية
audioPlayer.onended = () => {
  playBtn.textContent = "▶️ تشغيل";
};

function clearPlayer() {
  if (audioPlayer && !audioPlayer.paused) {
    audioPlayer.pause();
  }
  audioPlayer.removeAttribute("src"); // إلغاء الرابط
  audioPlayer.load(); // إعادة تهيئة المشغل
  playBtn.textContent = "▶️ تشغيل";
}

// حذف التسجيل الحالي
deleteAudioBtn.onclick = () => {
  if (confirm("هل تريد حذف التسجيل لهذه الصفحة؟")) {
    deleteAudio(currentImagePage);
    updateAudioControls(currentImagePage);
  }
};

// 🗑️ حذف جميع التسجيلات
document.getElementById("deleteAllAudioBtn").onclick = async () => {
  if (confirm("هل تريد حذف جميع التسجيلات الصوتية؟")) {
    try {
      await clearAllAudio();   // ✅ مسح من قاعدة البيانات IndexedDB
      clearPlayer();           // ✅ مسح الصوت الجاري من المشغل
      updateAudioControls(currentImagePage); // ✅ تحديث حالة الأزرار
      alert("🗑️✅ تم حذف جميع التسجيلات");
    } catch (e) {
      alert("❌ حدث خطأ أثناء الحذف");
      console.error(e);
    }
  }
};




  // ==================== تحديد عناصر واجهة المستخدم (DOM Elements) ====================

  const sb = document.getElementById("sidebar"),
    title = document.getElementById("partTitle"),
    totalEl = document.getElementById("partTotal"),
    container = document.getElementById("pagesContainer"),
    overlay = document.getElementById("overlay"),
    pageImage = document.getElementById("pageImage"),
    closeBtn = document.getElementById("closeBtn"),
    resetBtn = document.getElementById("resetBtn"),
    overlayCounterBtn = document.getElementById("overlayCounterBtn"),
    targetInput = document.getElementById("targetInput"),
    decTarget = document.getElementById("decTarget"),
    incTarget = document.getElementById("incTarget");

  // ==================== الدوال الأساسية ====================

  /**
   * دالة لحفظ جميع البيانات (العدادات والملاحظات والهدف) في الذاكرة المحلية.
   */
  const save = () => {
    localStorage.setItem("counts", JSON.stringify(counts));
    localStorage.setItem("notes", JSON.stringify(notes));
    localStorage.setItem("target", target);
  };

  /**
   * دالة لتنظيف النص ومنع حقن HTML (Sanitize).
   * @param {string} str - النص المراد تنظيفه.
   * @returns {string} - النص النظيف.
   */
  const sanitize = str => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  /**
   * دالة لتنسيق أرقام الصفحات بثلاثة أرقام (مثال: 5 -> 005).
   * @param {number} p - رقم الصفحة.
   * @returns {string} - رقم الصفحة المنسق.
   */
  function fmt(p) { return p.toString().padStart(3, '0'); }

  /**
   * دالة لعرض صفحات جزء معين.
   * @param {number} i - رقم الجزء (من 0 إلى 29).
   */
  function renderPart(i) {
    // حفظ رقم الجزء الحالي وتحديث واجهة المستخدم
    current = i;
    localStorage.setItem("lastPart", i);
    sb.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    sb.children[i].classList.add("active");
    sb.children[i].scrollIntoView({behavior: "smooth", inline: "center"});
    
    // استعراض نطاق الصفحات للجزء المحدد
    const [s, e] = parts[i];
    title.textContent = `الجزء ${i + 1}`;
    container.innerHTML = "";
    let total = 0;
    
    // إنشاء بطاقات الصفحات
    for (let p = s; p <= e; p++) {
      const count = counts[p] || 0;
      total += count;
      const percent = target > 0 ? Math.min((count / target) * 100, 100) : 0;
      const bg = `linear-gradient(to left, #c6f6d5 ${percent}%, transparent ${percent}%)`;
      const card = document.createElement("div");
      card.className = "page";
      if (highlightedPage === p) card.classList.add("highlight");
      
      card.innerHTML = `
        <span class="label">${p}</span>
        <div class="controls">
          <button class="btn count-btn">${count}</button>
          <textarea placeholder="بداية الصفحة" style="background-image:${bg}; "></textarea>
          <button class="btn show-btn">عرض</button>
        </div>`;
        
      const btnCount = card.querySelector(".count-btn"),
            ta = card.querySelector("textarea"),
            btnShow = card.querySelector(".show-btn");
            
      ta.value = notes[p] ? sanitize(notes[p]) : "";

      // حدث النقر على زر العد
      btnCount.onclick = () => {
        
        counts[p] = (counts[p] || 0) + 1;
        highlightedPage = p;
localStorage.setItem("highlightedPage", highlightedPage);

        // ✅ تسجيل المراجعة في إحصائيات التقويم
        const date = new Date();
        const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dateKey = localDate.toISOString().split("T")[0];
        let calendarStats = JSON.parse(localStorage.getItem("calendarStats") || "{}");
        calendarStats[dateKey] = (calendarStats[dateKey] || 0) + 1;
        localStorage.setItem("calendarStats", JSON.stringify(calendarStats));

        save();
        generateCalendar(); // لتحديث التقويم فورًا
        renderPart(i);
      };

      // حدث إدخال الملاحظات
      ta.oninput = () => {
        notes[p] = ta.value;
        save();
      };
      
      // حدث النقر على زر "عرض"
      btnShow.onclick = () => {
        currentImagePage = p;
        highlightedPage = p;
        localStorage.setItem("highlightedPage", highlightedPage);

        showImagePage(p);
        renderPart(i);
      };
      
      container.appendChild(card);
    }
    totalEl.textContent = total;
  }

  /**
   * دالة لعرض صورة الصفحة في الشاشة المنبثقة (Overlay).
   * @param {number} p - رقم الصفحة.
   */
  function showImagePage(p) {
    if (p < 1 || p > 604) return;

    currentImagePage = p;
    overlay.style.display = 'flex';
    document.body.classList.add("overlay-active");
    // ✅ إخفاء stopwatch
  document.getElementById("stopwatch").style.display = "none";
  updateAudioControls(p); // ✅ تحديث أزرار التسجيل عند فتح صفحة
  clearPlayer(); // ✅ إلغاء أي صوت قديم
  updateAudioControls(p); // ✅ تحديث أزرار التسجيل عند فتح صفحة
    pageImage.classList.add('slide');
    pageImage.onload = () => pageImage.classList.remove('slide');

    // تحديد مسار الصورة بناءً على نوع المصحف
    let src = mushafType === "normal"
      ? `https://lets-files2.s3.us-west-1.amazonaws.com/Quran-img/page${fmt(p)}.png`
      : `https://lets-files2.s3.us-west-1.amazonaws.com/quran-img-tajwed/${fmt(p)}.jpg`;

    pageImage.src = src;

    // تحديث المعلومات في الشاشة المنبثقة
    overlayCounterBtn.textContent = ` (${counts[p] || 0})`;
    const partIndex = parts.findIndex(([s, e]) => p >= s && p <= e);
    document.getElementById("overlayPartNum").textContent = `الجزء ${partIndex + 1}`;
    document.getElementById("overlayPageNum").textContent = `صفحة ${p}`;
    localStorage.setItem("lastPage", p);
  }

  // ==================== معالجة الأحداث (Event Listeners) ====================

  // عند النقر على زر العد في الشاشة المنبثقة
  overlayCounterBtn.onclick = () => {
    if (!currentImagePage) return;
    counts[currentImagePage] = (counts[currentImagePage] || 0) + 1;
    highlightedPage = currentImagePage;

    // ✅ تسجيل المراجعة في التاريخ الحالي
    const date = new Date();
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateKey = localDate.toISOString().split("T")[0];
    let calendarStats = JSON.parse(localStorage.getItem("calendarStats") || "{}");
    calendarStats[dateKey] = (calendarStats[dateKey] || 0) + 1;
    localStorage.setItem("calendarStats", JSON.stringify(calendarStats));

    save();
    overlayCounterBtn.textContent = ` (${counts[currentImagePage]})`;
    renderPart(current);
  };

  // عند النقر على زر الإغلاق في الشاشة المنبثقة
  closeBtn.onclick = () => {
    overlay.style.display = 'none';
    pageImage.src = '';
    currentImagePage = null;
    document.body.classList.remove("overlay-active");
    // ✅ إظهار stopwatch من جديد
  document.getElementById("stopwatch").style.display = "block";
  };

  // معالجة السحب على صورة المصحف للانتقال بين الصفحات
  pageImage.addEventListener('touchstart', e => window._touchStart = e.touches[0].clientX);
  pageImage.addEventListener('touchend', e => {
    const delta = e.changedTouches[0].clientX - window._touchStart;
    if (Math.abs(delta) > 50) showImagePage(currentImagePage + (delta > 0 ? 1 : -1));
  });

  // عند النقر على زر تصفير العداد
  resetBtn.onclick = () => {
    if (confirm("هل تريد تصفير العدادات؟")) {
      Object.keys(counts).forEach(k => delete counts[k]);
      // Object.keys(notes).forEach(k => delete notes[k]); // هذا السطر مُعطل
      save();
      renderPart(current);
    }
  };

  // معالجة تغيير قيمة الهدف (target)
  targetInput.value = target;
  targetInput.onchange = () => {
    const v = parseInt(targetInput.value) || 1;
    target = v > 0 ? v : 1;
    save();
    renderPart(current);
  };

  // ==================== جزء الإعدادات والقوائم الإضافية ====================

  // ⚙️ إظهار / إخفاء قائمة الإعدادات
  const settingsBtn = document.querySelector('#bottomNav button[title="الإعدادات"]');
  const settingsMenu = document.getElementById('settingsMenu');
  
  // حدث تغيير نوع المصحف
  document.querySelectorAll(".mushafSelector").forEach(btn => {
    btn.addEventListener("click", () => {
      mushafType = btn.dataset.type;
      localStorage.setItem("mushafType", mushafType);
      alert(`✅ تم اختيار: ${mushafType === 'tajweed' ? 'مصحف التجويد' : 'مصحف عادي'}`);
    });
  });

  // إظهار وإخفاء قائمة الإعدادات
  settingsBtn.addEventListener('click', () => {
    settingsMenu.style.display = settingsMenu.style.display === 'block' ? 'none' : 'block';
  });

  // 🧠 إظهار الأقسام الإضافية (مثل التقويم والملاحظات)
  document.querySelectorAll('.settingsOption').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.extra-section').forEach(sec => sec.style.display = 'none');
      document.getElementById('content').style.display = 'none';
      settingsMenu.style.display = 'none';
      const targetSection = document.getElementById(btn.dataset.target);
      targetSection.style.display = 'block';

      // ✅ إذا كان القسم هو التقويم، قم بتوليده
      if (btn.dataset.target === "calendarSection") {
        generateCalendar();
      }
    });
  });

  // ↩️ دالة للعودة إلى الواجهة الرئيسية
  window.backToMain = function () {
    document.querySelectorAll('.extra-section').forEach(sec => sec.style.display = 'none');
    document.getElementById('content').style.display = 'block';
  };

  // 📒 حفظ النوتة العامة
  const generalNoteArea = document.getElementById('generalNoteArea');
  generalNoteArea.value = localStorage.getItem('generalNote') || '';
  generalNoteArea.oninput = () => localStorage.setItem('generalNote', generalNoteArea.value);

  // 🗓️ حفظ السجل اليومي
  const dailyLogArea = document.getElementById('dailyLogArea');
  dailyLogArea.value = localStorage.getItem('dailyLog') || '';
  dailyLogArea.oninput = () => localStorage.setItem('dailyLog', dailyLogArea.value);

  // ==================== إدارة المهام اليومية ====================

  const newTaskInput = document.getElementById('newTaskInput');
  const taskList = document.getElementById('taskList');
  let tasks = JSON.parse(localStorage.getItem('tasksList') || '[]');
// ⏰ تنسيق وقت مختصر (س:د)
function formatTimeHM(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// 🔊 صوت تنبيه بسيط
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    // تجاهل لو رفض المتصفح
  }
}

// 🔔 عرض التذكير (إشعار + اهتزاز + تلوين المهمة)
function showReminder(task, indexInUI) {
  const notify = () => {
    try {
      new Notification('تذكير مهمة', {
        body: task.text || '',
        icon: 'favicon.ico'
      });
    } catch (e) {
      alert('⏰ تذكير: ' + (task.text || 'مهمة'));
    }
  };

  if ('Notification' in window) {
    if (Notification.permission === 'granted') notify();
    else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { if (p === 'granted') notify(); else alert('⏰ تذكير: ' + (task.text || 'مهمة')); });
    } else {
      alert('⏰ تذكير: ' + (task.text || 'مهمة'));
    }
  } else {
    alert('⏰ تذكير: ' + (task.text || 'مهمة'));
  }

  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  playBeep();

  // تلوين الصف في الواجهة إن وُجد
  const items = document.querySelectorAll('#taskList li');
  if (items[indexInUI]) {
    items[indexInUI].classList.add('task-reminder');
    setTimeout(() => items[indexInUI].classList.remove('task-reminder'), 6000);
  }
}

// ⏲️ مراقبة التذكيرات
let reminderTimer = null;
function checkReminders() {
  const now = Date.now();
  let updated = false;

  tasks.forEach((t, idx) => {
    if (t && t.reminderAt && now >= t.reminderAt) {
      // اطلق التذكير مرة واحدة ثم ألغِه
      showReminder(t, idx);
      t.reminderAt = null;
      updated = true;
    }
  });

  if (updated) {
    localStorage.setItem('tasksList', JSON.stringify(tasks));
    renderTasks();
  }
}

function startReminderWatcher() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(checkReminders, 5000); // كل 5 ثواني
}

  /**
   * دالة لعرض قائمة المهام.
   */
function renderTasks() {
  taskList.innerHTML = '';

  tasks.forEach((rawTask, i) => {
    // الحفاظ على الخلفية القديمة للبيانات (لو كانت نص فقط)
    const task = (typeof rawTask === 'string') ? { text: rawTask, completed: false } : rawTask;
    // تأكد من وجود خصائص جديدة
    if (!task.hasOwnProperty('completed')) task.completed = false;
    if (!task.hasOwnProperty('reminderAt')) task.reminderAt = null;
    if (!task.hasOwnProperty('id')) task.id = Date.now() + '_' + Math.random().toString(36).slice(2);

    // عنصر المهمة
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.padding = '3px';
    li.style.marginBottom = '8px';
    li.style.background = '#f1f1f1';
    li.style.borderRadius = '8px';
    li.style.gap = '3px';
    // الجهة اليسرى
    const leftSide = document.createElement('div');
    leftSide.style.display = 'flex';
    leftSide.style.alignItems = 'center';
    leftSide.style.gap = '4px';
    leftSide.style.flex = '1';
    leftSide.style.minWidth = '0';

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!task.completed;

    // أيقونة "تمت المهمة"
    const checkIcon = document.createElement('span');
    checkIcon.textContent = '   انتهى   ';
    checkIcon.style.color = '#2ecc71';
    checkIcon.style.display = 'inline-block';
    checkIcon.style.opacity = task.completed ? '1' : '0';
    checkIcon.style.transform = task.completed ? 'scale(1)' : 'scale(0.6)';

    if (task.completed) checkIcon.classList.add('check-bounce');

    // نص المهمة
    const taskText = document.createElement('span');
    taskText.textContent = task.text || '';
    taskText.style.flex = '1';
    taskText.style.minWidth = '0';
    taskText.style.whiteSpace = 'normal';
    taskText.style.wordBreak = 'break-word';
    taskText.style.lineHeight = '1.4';
    taskText.style.transition = 'color .3s, text-decoration .3s';

    if (task.completed) {
      taskText.style.textDecoration = 'line-through';
      taskText.style.color = '#999';
      li.style.background = '#d4ffd4';
    }

    // تغيير حالة الإكمال
    checkbox.addEventListener('change', () => {
      task.completed = checkbox.checked;
      if (checkbox.checked) {
        taskText.style.textDecoration = 'line-through';
        taskText.style.color = '#999';
        li.style.background = '#d4ffd4';
        checkIcon.style.opacity = '1';
        checkIcon.style.transform = 'scale(1)';
      } else {
        taskText.style.textDecoration = 'none';
        taskText.style.color = '';
        li.style.background = '#f1f1f1';
        checkIcon.style.opacity = '0';
        checkIcon.style.transform = 'scale(0.6)';
      }
      tasks[i] = task;
      localStorage.setItem('tasksList', JSON.stringify(tasks));
    });

    // بادج وقت التذكير (لو موجود)
    // if (task.reminderAt) {
    //   const badge = document.createElement('span');
    //   badge.className = 'reminder-badge';
    //   badge.textContent = + formatTimeHM(task.reminderAt);
    //   leftSide.appendChild(badge);
    // }

    // زر ⏰ تذكير
    const reminderBtn = document.createElement('button');
    reminderBtn.className = 'reminder-btn';
    reminderBtn.textContent = task.reminderAt ? ' تعديل ' : 'تذكير';
    reminderBtn.onclick = () => {
      // اطلب دقائق من المستخدم
      const def = task.reminderAt ? Math.max(1, Math.round((task.reminderAt - Date.now()) / 60000)) : 10;
      const minutesStr = prompt('بعد كم دقيقة تريد التذكير؟', String(def));
      if (minutesStr === null) return;
      const mins = parseInt(minutesStr, 10);
      if (isNaN(mins) || mins <= 0) {
        alert('من فضلك أدخل رقم دقائق صحيح (1 أو أكثر)');
        return;
      }

      // اطلب إذن الإشعارات مرة واحدة عند الحاجة
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      task.reminderAt = Date.now() + mins * 60000;
      tasks[i] = task;
      localStorage.setItem('tasksList', JSON.stringify(tasks));
      renderTasks();
      checkReminders(); // في حال كانت المدة قصيرة
    };

    // زر إلغاء التذكير (لو محدد)
    let cancelReminderBtn = null;
    if (task.reminderAt) {
      cancelReminderBtn = document.createElement('button');
      cancelReminderBtn.className = 'cancel-reminder';
      cancelReminderBtn.textContent = 'إلغاء ';
      cancelReminderBtn.onclick = () => {
        task.reminderAt = null;
        tasks[i] = task;
        localStorage.setItem('tasksList', JSON.stringify(tasks));
        renderTasks();
      };
    }

    // زر الحذف
    const deleteBtn = document.createElement('button');
deleteBtn.textContent = '🗑️';
deleteBtn.className = 'delete-btn';
deleteBtn.onclick = () => {
  if (confirm('هل أنت متأكد أنك تريد حذف هذه المهمة؟')) {
    tasks.splice(i, 1);
    localStorage.setItem('tasksList', JSON.stringify(tasks));
    renderTasks();
  }
};


    // تركيب العناصر
    leftSide.appendChild(checkbox);
    leftSide.appendChild(checkIcon);
    leftSide.appendChild(taskText);
    li.appendChild(leftSide);
    li.appendChild(reminderBtn);
    if (cancelReminderBtn) li.appendChild(cancelReminderBtn);
    li.appendChild(deleteBtn);

    taskList.appendChild(li);
    tasks[i] = task; // تأكد من حفظ الشكل الجديد
  });

  // تأكيد الحفظ (في حال تم ترقية شكل عناصر قديمة)
  localStorage.setItem('tasksList', JSON.stringify(tasks));
}


  /**
   * دالة لإضافة مهمة جديدة.
   */
window.addTask = function () {
  const val = newTaskInput.value.trim();
  if (!val) return;

  const newItem = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2),
    text: val,
    completed: false,
    reminderAt: null
  };

  tasks.push(newItem);
  newTaskInput.value = '';
  localStorage.setItem('tasksList', JSON.stringify(tasks));
  renderTasks();
  checkReminders();
};


  // عرض المهام عند تحميل الصفحة
  renderTasks();
startReminderWatcher();
checkReminders(); // فحص أولي

  // ==================== الدوال التمهيدية ====================
  
  /**
   * دالة لإنشاء شريط الأجزاء الجانبي.
   */
  function initSidebar() {
    parts.forEach((_, i) => {
      const b = document.createElement("button");
      b.textContent = `الجزء ${i+1}`;
      b.onclick = () => renderPart(i);
      sb.appendChild(b);
    });
    renderPart(current);
  }

  /**
   * دالة لتوليد التقويم الشهري وعرض إحصائيات المراجعة.
   */
  function generateCalendar() {
    const container = document.getElementById("calendarContainer");
    container.innerHTML = "";

    // تحديد التاريخ الحالي
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayKey = localToday.toISOString().split("T")[0];

    // حساب أيام الشهر
    const firstDay = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startDay = firstDay.getDay(); // 0 = الأحد

    let calendarStats = JSON.parse(localStorage.getItem("calendarStats") || "{}");

    // ✅ زر تصفير السجل
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "🗑️ محو السجل";
    resetBtn.style.margin = "10px auto";
    resetBtn.style.display = "block";
    resetBtn.style.padding = "6px 12px";
    resetBtn.style.background = "#ff6b6b";
    resetBtn.style.color = "white";
    resetBtn.style.border = "none";
    resetBtn.style.borderRadius = "6px";
    resetBtn.style.cursor = "pointer";
    resetBtn.style.fontWeight = "bold";

    resetBtn.onclick = () => {
      if (confirm("هل أنت متأكد أنك تريد محو السجل بالكامل؟")) {
        localStorage.removeItem("calendarStats");
        generateCalendar(); // إعادة توليد التقويم
      }
    };

    container.appendChild(resetBtn);

    // إضافة فراغات لأيام بداية الشهر
    for (let i = 0; i < startDay; i++) {
      const empty = document.createElement("div");
      container.appendChild(empty);
    }

    // إنشاء خلايا التقويم لكل يوم
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const key = date.toISOString().split("T")[0];
      const count = calendarStats[key] || 0;

      const cell = document.createElement("div");
      cell.style.padding = "1px";
      cell.style.borderRadius = "6px";
      cell.style.textAlign = "center";
      cell.style.border = "1px solid #ccc";
      cell.style.fontSize = "10px";
      cell.style.background = "#f9f9f9";
      cell.style.fontWeight = "bold";

      cell.innerHTML = `
        <div style="font-weight:bold; font-size:10px;">${d}</div>
        <div style="color:#0077b6; font-weight:bold; ">${count > 0 ? `${count} صفحة` : "-"}</div>
      `;

      if (key === todayKey) {
        cell.style.outline = "2px solid #0077b6";
        cell.style.background = "#e3f2fd";
      }

      container.appendChild(cell);
    }
  }

  // ==================== الإعدادات عند تحميل الصفحة ====================

  window.onload = () => {
    initSidebar();
    
   const savedHighlight = parseInt(localStorage.getItem("highlightedPage"));
if (savedHighlight) {
  highlightedPage = savedHighlight;
  // نحدد الجزء اللي فيه الصفحة
  const idx = parts.findIndex(([s,e]) => savedHighlight >= s && savedHighlight <= e);
  if (idx >= 0) renderPart(idx); // هيعرض الجزء ويظلل الصفحة
}

    
    // إخفاء قائمة الإعدادات عند النقر خارجها
  ["click", "touchstart"].forEach(evt => {
  document.addEventListener(evt, function (event) {
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsBtn = document.querySelector('#bottomNav button[title="الإعدادات"]');

    if (
      settingsMenu &&
      settingsMenu.style.display === 'block' &&
      !settingsMenu.contains(event.target) &&
      !settingsBtn.contains(event.target)
    ) {
      settingsMenu.style.display = 'none';
    }
  });
});

    
    // إظهار وإخفاء قائمة المواقع الهامة
    const importantSitesBtn = document.getElementById('importantSitesBtn');
    const importantSitesList = document.getElementById('importantSitesList');
    if (importantSitesBtn && importantSitesList) {
      importantSitesBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = importantSitesList.style.display === 'block';
        importantSitesList.style.display = isOpen ? 'none' : 'block';
      });

      importantSitesList.addEventListener('click', function(e) {
        e.stopPropagation();
      });

      document.addEventListener('click', function() {
        importantSitesList.style.display = 'none';
      });
    }


  };
})();