import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, addDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD_tuhYxaa5vDmE6VfnxyM7KshRT8vs3Kk",
    authDomain: "calendar-240d0.firebaseapp.com",
    projectId: "calendar-240d0",
    storageBucket: "calendar-240d0.firebasestorage.app",
    messagingSenderId: "1061462890887",
    appId: "1:1061462890887:web:df1934fa29df8e0fc1db22"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// 로컬 스토리지/세션 스토리지 기반 하이브리드 로그인 상태 관리
let isAdmin = false;
let currentAdminProfile = null;

async function seedAdmin() {
    try {
        const q = query(collection(db, "admins"));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            console.log("관리자 정보가 없어 기본 계정을 생성합니다.");
            const defaultAdmin = {
                id: 'been11060',
                pw: '59110659',
                name: '오구',
                img: 'https://stimg.sooplive.com/LOGO/be/been11060/been11060.jpg'
            };
            await addDoc(collection(db, "admins"), defaultAdmin);
            console.log("기본 관리자 계정 생성 완료.");
        }
    } catch (e) {
        console.error("관리자 정보 초기화 오류:", e);
    }
}

function initAuth() {
    let sessionToken = localStorage.getItem('59_admin_session');
    if (!sessionToken) {
        sessionToken = sessionStorage.getItem('59_admin_session');
    }

    if (sessionToken) {
        const profiles = JSON.parse(localStorage.getItem('59_saved_profiles') || '[]');
        const profile = profiles.find(p => p.token === sessionToken);
        if (profile) {
            isAdmin = true;
            currentAdminProfile = profile;
            return;
        }
    }
    isAdmin = false;
    currentAdminProfile = null;
}

let modifiedDates = new Set();
let currentDate = new Date();
let events = {};
let loadedMonths = new Set();
let members = {};
let currentAMPM = '오전';
let activeMemoTab = '컨텐츠';
let activeDateId = '';
let pickerYear = currentDate.getFullYear();
let memoLoadToken = 0;

function setAMPM(val) {
    currentAMPM = val;
    const amBtn = document.getElementById('ampmAM');
    const pmBtn = document.getElementById('ampmPM');
    if (amBtn) amBtn.classList.toggle('active', val === '오전');
    if (pmBtn) pmBtn.classList.toggle('active', val === '오후');
}

function normalizeDateId(dateStr) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${year}-${String(Number(month))}-${String(Number(day))}`;
}

let wikiCategoryCount = 1; 
let isWikiEditMode = false;

/* ==========================================================================
   [신규 기능] 다중 프로필 UI 렌더링 및 클릭 이벤트 핸들러
   ========================================================================== */
function renderProfileLoginArea() {
    const profiles = JSON.parse(localStorage.getItem('59_saved_profiles') || '[]');
    const profileArea = document.getElementById('profileLoginArea');
    const listEl = document.getElementById('savedProfilesList');

    if (profiles.length > 0) {
        profileArea.style.display = 'block';
        listEl.innerHTML = '';
        
        profiles.forEach(p => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; padding: 5px; min-width: 65px; transition: transform 0.2s;';
            
            // 프로필 원클릭 자동 매칭 로그인 이미지 호출
            const img = document.createElement('img');
            img.src = p.img;
            img.style.cssText = 'width: 54px; height: 54px; border-radius: 50%; border: 3px solid #93C5FD; object-fit: cover; box-shadow: 0 4px 6px rgba(0,0,0,0.08);';
            img.onerror = () => { img.src = 'https://placehold.co/100x100?text=?'; };
            img.onclick = () => loginWithProfile(p);

            // 관리자 표기명
            const name = document.createElement('span');
            name.innerText = p.name;
            name.style.cssText = 'font-size: 12px; font-weight: 900; margin-top: 6px; color: #1e3a8a; font-family: "Cafe24SurroundAir", sans-serif; text-align: center; max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            
            // 프로필 배열 내 개별 삭제 처리 토글 단추 (기본적으로 display: none 처리)
            const delBtn = document.createElement('button');
            delBtn.innerText = '✕';
            delBtn.style.cssText = 'position: absolute; top: -2px; right: -2px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; font-weight: bold; cursor: pointer; display: none; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.15);';
            delBtn.onclick = (e) => { 
                e.stopPropagation(); 
                if(confirm(`[${p.name}] 관리자 프로필을 이 기기에서 삭제하시겠습니까?`)) removeSavedProfile(p.id); 
            };

            // 마우스 호버 시 크기 커짐 + X 버튼 등장
            wrap.onmouseover = () => {
                wrap.style.transform = 'scale(1.08)';
                delBtn.style.display = 'flex';
            };
            
            // 마우스 벗어날 시 원래대로 복구 + X 버튼 숨김
            wrap.onmouseout = () => {
                wrap.style.transform = 'scale(1)';
                delBtn.style.display = 'none';
            };

            wrap.appendChild(img);
            wrap.appendChild(name);
            wrap.appendChild(delBtn);
            listEl.appendChild(wrap);
        });
    } else {
        profileArea.style.display = 'none';
    }
}

function removeSavedProfile(id) {
    let profiles = JSON.parse(localStorage.getItem('59_saved_profiles') || '[]');
    profiles = profiles.filter(p => p.id !== id);
    localStorage.setItem('59_saved_profiles', JSON.stringify(profiles));
    renderProfileLoginArea();
}

window.loginWithProfile = function(profile) {
    let profiles = JSON.parse(localStorage.getItem('59_saved_profiles') || '[]');
    const storedProfile = profiles.find(p => p.token === profile.token);
    
    if (storedProfile && profile.token !== 'expired') {
        isAdmin = true;
        currentAdminProfile = storedProfile;
        
        localStorage.setItem('59_admin_session', storedProfile.token);
        
        closeModal('pwModal'); 
        updateAdminUI(); 
        renderCalendar(); 
        showToast(`${storedProfile.name}님 환영합니다.`);
    } else {
        let profiles = JSON.parse(localStorage.getItem('59_saved_profiles') || '[]');
        profiles = profiles.filter(p => p.id !== profile.id && p.token !== 'expired');
        localStorage.setItem('59_saved_profiles', JSON.stringify(profiles));

        showToast('인증이 만료되었습니다. 비밀번호를 입력해 주세요.');
        renderProfileLoginArea();
        document.getElementById('adminId').value = profile.id;
        document.getElementById('adminPw').focus();
    }
}

window.switchMainTab = function(tabName) {
    const calSection = document.getElementById('calendarSection');
    const wikiSection = document.getElementById('wikiSection');
    const calBtn = document.getElementById('calendarSidebarBtn');
    const wikiBtn = document.getElementById('wikiSidebarBtn');

    if (tabName === 'calendar') {
        calSection.style.display = 'flex';
        wikiSection.style.display = 'none';
        if (calBtn) calBtn.classList.add('active');
        if (wikiBtn) wikiBtn.classList.remove('active');
        if (window.location.hash !== '#schedule') {
            window.location.hash = '#schedule';
        }
    } else if (tabName === 'wiki') {
        calSection.style.display = 'none';
        wikiSection.style.display = 'flex';
        if (calBtn) calBtn.classList.remove('active');
        if (wikiBtn) wikiBtn.classList.add('active');
        if (window.location.hash !== '#wiki') {
            window.location.hash = '#wiki';
        }
    }
};

function toggleUpBoard() {
    const upPanel = document.getElementById('upPanel');
    const isVisible = upPanel.classList.contains('active');

    if (isVisible) {
        upPanel.classList.remove('active');
    } else {
        document.getElementById('memoPanel').classList.remove('active');
        upPanel.classList.add('active');
    }
}

window.extractYtId = function(url) {
    if(!url) return null;
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : null;
};
const extractYtId = window.extractYtId;

function getWeekOfMonth(date) {
    const target = new Date(date);
    const day = target.getDay();
    const diff = target.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(target.setDate(diff));
    const year = monday.getFullYear();
    const month = monday.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    let firstMonday = new Date(year, month, 1 - firstDayOfWeek);
    const diffTime = monday.getTime() - firstMonday.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    const weekNo = Math.floor(diffDays / 7) + 1;
    return { month: month + 1, week: weekNo };
}

window.handleManageImgUpload = async function(input) {
    if (input.files && input.files[0]) {
        try {
            showToast('일정 이미지를 업로드 중입니다...');
            const formData = new FormData();
            formData.append("file", input.files[0]);
            formData.append("upload_preset", "IMG_1234");
            const response = await fetch(`https://api.cloudinary.com/v1_1/dtlqzklk5/image/upload`, { method: "POST", body: formData });
            const data = await response.json();

            if (data.secure_url) {
                const card = input.closest('.manage-event-card');
                card.querySelector('.m-img-url').value = data.secure_url;
                const preview = card.querySelector('.m-img-preview');
                preview.src = data.secure_url;
                preview.style.display = 'block';
                card.querySelector('.m-img-remove').style.display = 'inline-block';
                showToast('이미지가 성공적으로 업로드되었습니다.');
            }
        } catch (error) {
            console.error(error);
            showToast('일정 이미지 업로드에 실패했습니다.');
        }
    }
};

window.removeManageImg = function(btn) {
    const card = btn.closest('.manage-event-card');
    card.querySelector('.m-img-url').value = '';
    card.querySelector('input[type="file"]').value = '';
    const preview = card.querySelector('.m-img-preview');
    preview.src = '';
    preview.style.display = 'none';
    btn.style.display = 'none';
};

window.updateManageImgPreview = function(input) {
    const card = input.closest('.manage-event-card');
    const preview = card.querySelector('.m-img-preview');
    const removeBtn = card.querySelector('.m-img-remove');
    const url = input.value.trim();
    
    if (url) {
        preview.src = url;
        preview.style.display = 'block';
        removeBtn.style.display = 'inline-block';
    } else {
        preview.src = '';
        preview.style.display = 'none';
        removeBtn.style.display = 'none';
    }
};

async function addMember() {
    const name = document.getElementById('newMemberName').value.trim();
    const soopId = document.getElementById('newMemberId').value.trim();
    if (!name) return showToast('닉네임을 입력해주세요.');
    if (!soopId) return showToast('SOOP 아이디를 입력해주세요.');

    const prefix = soopId.substring(0, 2).toLowerCase();
    const img = `https://stimg.sooplive.com/LOGO/${prefix}/${soopId}/${soopId}.jpg`;
    const id = `member_${encodeURIComponent(name)}`;
    const data = { name, img, soopId };

    try {
        await setDoc(doc(db, 'members', id), data);
        await loadMembersFromFirebase();
        document.getElementById('newMemberName').value = '';
        document.getElementById('newMemberId').value = '';
        renderMemberList();
        showToast(`${name} 멤버가 추가되었습니다.`);
    } catch (error) { showToast(`멤버 저장 실패: ${error.message}`); }
}

function deleteMember(name) {
    const btn = document.getElementById('confirmBtn');
    document.getElementById('confirmMessage').innerText = `[${name}] 멤버를 삭제할까요?`;
    btn.onclick = async () => {
        try {
            await deleteDoc(doc(db, 'members', `member_${encodeURIComponent(name)}`));
            delete members[name];
            renderMemberList();
            closeModal('confirmModal');
            showToast(`${name} 멤버가 삭제되었습니다.`);
        } catch (error) { console.error(error); showToast('멤버 삭제에 실패했습니다.'); }
    };
    document.getElementById('confirmModal').style.display = 'flex';
}

function openMemberManager() { renderMemberList(); document.getElementById('memberModal').style.display = 'flex'; }

function renderMemberList() {
    const list = document.getElementById('memberList');
    list.innerHTML = '';
    Object.values(members).forEach(m => {
        const item = document.createElement('div');
        item.className = 'member-list-item';
        item.innerHTML = `<img src="${m.img}" class="member-img-preview" onerror="this.src='https://placehold.co/100x100?text=?'"><div style="flex:1; font-weight:800;">${m.name}</div><button class="text-red-400 font-bold" onclick="deleteMember('${m.name}')">삭제</button>`;
        list.appendChild(item);
    });
}

function showToast(msg) {
    const toast = document.getElementById('toastMessage');
    if(!toast) return;
    toast.innerText = msg; toast.style.display = 'block';
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

function closeModal(id) { 
    const el = document.getElementById(id);
    if(el) el.style.display = 'none'; 
}

function formatTime12h(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    return `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${m.toString().padStart(2, '0')}`;
}

async function loadMembersFromFirebase() {
    members = {};
    const snapshot = await getDocs(collection(db, 'members'));
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!data || !data.name) return;
        members[data.name] = { name: data.name, img: data.img || `https://placehold.co/100x100/BFDBFE/ffffff?text=${encodeURIComponent(data.name[0] || '')}` };
    });
}

async function loadEventsForMonth(year, month) {
    const monthStr = String(month);
    const monthKey = `${year}-${monthStr}`;
    
    if (loadedMonths.has(monthKey)) return;

    const q = query(
        collection(db, 'events'), 
        where('dateId', '>=', `${year}-${monthStr}-`), 
        where('dateId', '<=', `${year}-${monthStr}-\uf8ff`)
    );
    
    const snapshot = await getDocs(q);
    const docs = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!data || !data.dateId) return;
        docs.push({ ...data, id: docSnap.id });
    });

    docs.sort((a, b) => {
        const dateA = new Date(a.startDate || a.dateId).getTime();
        const dateB = new Date(b.startDate || b.dateId).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return (a.order ?? 9999) - (b.order ?? 9999);
    });

    docs.forEach(data => {
        if (!events[data.dateId]) events[data.dateId] = [];
        if (!events[data.dateId].some(e => e.id === data.id)) events[data.dateId].push(data);
    });
    
    loadedMonths.add(monthKey);
}

async function ensureMonthsLoadedForDate(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    await loadEventsForMonth(y, m);

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        const target = new Date(date);
        const dayNum = target.getDay();
        const diff = target.getDate() - dayNum + (dayNum === 0 ? -6 : 1);
        const monday = new Date(target.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        if (monday.getMonth() !== date.getMonth()) await loadEventsForMonth(monday.getFullYear(), monday.getMonth() + 1);
        if (sunday.getMonth() !== date.getMonth()) await loadEventsForMonth(sunday.getFullYear(), sunday.getMonth() + 1);
    }
}

async function loadData() {
    try { 
        await loadMembersFromFirebase();
        await loadMemos();
        await loadWikiData();
        try { await loadUpItems(); } catch (e) { console.log("UP 컬렉션 로드 실패:", e); }
    } catch (error) { console.error("데이터 로드 오류:", error); }
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if(!grid) return;
    grid.innerHTML = '';
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
        grid.className = 'calendar-grid weekly-view';
        const target = new Date(currentDate);
        const dayNum = target.getDay();
        const diff = target.getDate() - dayNum + (dayNum === 0 ? -6 : 1);
        const monday = new Date(target.setDate(diff));
        
        const { month, week } = getWeekOfMonth(currentDate);
        const monthDisplay = document.getElementById('monthDisplay');
        if(monthDisplay) monthDisplay.innerText = `${month}월 ${week}째주`;
        
        const yoils = ['월', '화', '수', '목', '금', '토', '일'];
        const yoilColors = ['', '', '', '', '', 'text-blue-500', 'text-red-500'];
        
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(monday);
            dayDate.setDate(monday.getDate() + i);
            
            const num = dayDate.getDate(); const m = dayDate.getMonth() + 1; const y = dayDate.getFullYear();
            const dateId = `${y}-${m}-${num}`;
            
            const row = document.createElement('div');
            row.className = 'week-row';
            const isToday = dayDate.getDate() === new Date().getDate() && 
                            dayDate.getMonth() === new Date().getMonth() && 
                            dayDate.getFullYear() === new Date().getFullYear();
            if (isToday) row.classList.add('today-row');
            
            row.onclick = () => showDayEvents(dateId, events[dateId] || []);
            
            if (isAdmin) {
                row.oncontextmenu = (e) => {
                    e.preventDefault();
                    openDayManageModal(dateId);
                };
            }
            
            const dayLabel = document.createElement('div'); 
            dayLabel.className = 'week-day-label';

            const dayName = document.createElement('div'); 
            dayName.className = `week-day-name ${yoilColors[i] || ''}`; 
            dayName.innerText = yoils[i];

            const dayNumber = document.createElement('div'); 
            dayNumber.className = `week-day-num`; 
            dayNumber.innerText = num;
            
            dayLabel.appendChild(dayName);
            dayLabel.appendChild(dayNumber);

            const eventsDiv = document.createElement('div'); eventsDiv.className = 'week-events';
            if (events[dateId] && events[dateId].length > 0) {
                events[dateId].forEach((ev, idx) => {
                    const isLong = ev.startDate && ev.endDate && (new Date(ev.endDate) > new Date(ev.startDate));
                    const tag = document.createElement('div');
                    tag.className = `event-tag type-${ev.type}${isLong ? ' long-term' : ''}`; tag.dataset.id = ev.id;
                    tag.innerHTML = `${ev.time ? `<span class="event-time-badge">${formatTime12h(ev.time)}</span>` : ''}<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; line-height: 1.2; word-break: break-word; white-space: pre-wrap; text-align: center;">${ev.title}</div>`;                    tag.onclick = (e) => { e.stopPropagation(); showInfoByEvent(ev); };
                    if (isAdmin) tag.oncontextmenu = (e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        openDayManageModal(ev.dateId || (ev.startDate ? ev.startDate.split('T')[0] : activeDateId)); 
                    };
                    eventsDiv.appendChild(tag);
                });
            } else {
                const noEvent = document.createElement('div'); noEvent.className = 'week-no-event'; noEvent.innerText = '등록된 일정이 없습니다.'; eventsDiv.appendChild(noEvent);
            }
            row.appendChild(dayLabel); row.appendChild(eventsDiv); grid.appendChild(row);
        }
    } else {
        grid.className = 'calendar-grid';
        grid.innerHTML = `<div class="day-label">월</div><div class="day-label">화</div><div class="day-label">수</div><div class="day-label">목</div><div class="day-label">금</div><div class="day-label text-blue-400">토</div><div class="day-label text-red-400">일</div>`;
        
        const y = currentDate.getFullYear(); const m = currentDate.getMonth();
        const monthDisplay = document.getElementById('monthDisplay');
        if (monthDisplay) monthDisplay.innerText = `${m + 1}월`;
        
        const firstDay = new Date(y, m, 1); const lastDay = new Date(y, m + 1, 0);
        const startIdx = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        const prevLastDay = new Date(y, m, 0).getDate();
        
        for (let i = startIdx; i > 0; i--) createDay(prevLastDay - i + 1, false);
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const d = new Date(y, m, i); const dateId = `${y}-${m + 1}-${i}`;
            const allEvents = Object.values(events).flat();
            
            const todaysEventsRaw = allEvents.filter(ev => {
                if (!ev.startDate) return ev.dateId === dateId;
                const start = new Date(ev.startDate); const end = new Date(ev.endDate);
                start.setHours(0,0,0,0); end.setHours(0,0,0,0);
                return d >= start && d <= end;
            });

            const uniqueEvents = [];
            const seen = new Set();
            todaysEventsRaw.forEach(ev => {
                const key = `${ev.title}_${ev.time || ''}_${ev.type || ''}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueEvents.push(ev);
                }
            });

            createDay(i, true, uniqueEvents);
        }
    }
    applyDraggable(); updateAdminUI(); updateSummary();
}

function applyDraggable() {
    document.querySelectorAll('.event-container, .week-events').forEach(el => {
        if (isAdmin) {
            if (!el.sortableInstance && window.Sortable) {
                el.sortableInstance = new Sortable(el, {
                    animation: 150, ghostClass: 'dragging-ghost', fallbackOnBody: true, delay: 200, delayOnTouchOnly: true, fallbackTolerance: 5,
                    onStart: function(evt) { evt.item.style.height = evt.item.offsetHeight + 'px'; },
                    onEnd: function (evt) {
                        evt.item.style.height = '';
                        const dateId = evt.to.closest('.day')?.dataset.dateId || evt.to.parentElement.closest('.week-row')?.dataset.dateId;
                        if (dateId) modifiedDates.add(dateId);
                    }
                });
            }
        } else {
            if (el.sortableInstance) { el.sortableInstance.destroy(); el.sortableInstance = null; }
        }
    });
}

function createDay(num, isCurr, dayEvents = []) {
    const dateId = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${num}`;
    const div = document.createElement('div'); div.dataset.dateId = dateId; div.className = 'day' + (isCurr ? '' : ' not-current');
    const numDiv = document.createElement('div'); numDiv.className = 'day-num';
    const today = new Date();
    const isToday = isCurr && today.getDate() === num && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
    numDiv.innerHTML = isCurr ? (isToday ? `<span class="today-circle">${num}</span>` : num) : '';
    div.appendChild(numDiv);
    const evCont = document.createElement('div'); evCont.className = 'event-container';
    
    if (isCurr && dayEvents && dayEvents.length > 0) {
        dayEvents.forEach((ev, idx) => {
            const isLong = ev.startDate && ev.endDate && (new Date(ev.endDate) > new Date(ev.startDate));
            const tag = document.createElement('div');
            tag.className = `event-tag type-${ev.type}${isLong ? ' long-term' : ''}`; tag.dataset.id = ev.id;
            tag.innerHTML = `${ev.time ? `<span class="event-time-badge">${formatTime12h(ev.time)}</span>` : ''}<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; line-height: 1.2; word-break: break-word; white-space: pre-wrap;">${ev.title}</div>`;
            tag.onclick = (e) => { e.stopPropagation(); showInfoByEvent(ev); };
            if (isAdmin) tag.oncontextmenu = (e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                openDayManageModal(ev.dateId || (ev.startDate ? ev.startDate.split('T')[0] : activeDateId)); 
            };
            evCont.appendChild(tag);
        });
    }
    div.appendChild(evCont);
    
    if (isCurr) {
        div.onclick = (e) => showDayEvents(dateId, dayEvents);
        if (isAdmin) {
            div.oncontextmenu = (e) => {
                e.preventDefault();
                openDayManageModal(dateId);
            };
        }
    }
    document.getElementById('calendarGrid').appendChild(div);
}

function showInfo(id, idx) {
    const ev = events[id]?.[idx];
    if (!ev) return;
    showInfoByEvent(ev);
}

function showInfoByEvent(ev) {
    if (!ev) return;
    const titleEl = document.getElementById('infoTitle');
    if (titleEl) titleEl.innerText = ev.title || '';
    
    let dateText = '';
    if (ev.startDate && ev.endDate) {
        const s = new Date(ev.startDate); const e = new Date(ev.endDate);
        dateText = `${s.getFullYear().toString().slice(-2)}.${s.getMonth()+1}.${s.getDate()}${(ev.time ? ` | ${formatTime12h(ev.time)}` : '')}`;
        if (ev.startDate !== ev.endDate) dateText = `${s.getFullYear().toString().slice(-2)}.${s.getMonth()+1}.${s.getDate()} - ${e.getFullYear().toString().slice(-2)}.${e.getMonth()+1}.${e.getDate()}${(ev.time ? ` | ${formatTime12h(ev.time)}` : '')}`;
    } else if (ev.dateId) {
        const parts = ev.dateId.split('-'); dateText = `${parts[0].slice(-2)}.${parts[1]}.${parts[2]}${(ev.time ? ` | ${formatTime12h(ev.time)}` : '')}`;
    } else {
        dateText = ev.time ? formatTime12h(ev.time) : '시간 미정';
    }
    const timeEl = document.getElementById('infoTime'); 
    if (timeEl) {
        timeEl.innerText = dateText + (ev.type ? ` | ${ev.type}` : '');
        timeEl.className = timeEl.className.replace(/\btype-\S+/g, '').trim();
        if (ev.type) {
            timeEl.classList.add(`type-${ev.type.replace(/\s+/g, '')}`);
        }
    }
    
    const infoImageContainer = document.getElementById('infoImageContainer');
    if(infoImageContainer) {
        infoImageContainer.innerHTML = '';
        if (ev.imageUrl) {
            const img = document.createElement('img'); img.src = ev.imageUrl; img.alt = ev.title; img.className = 'info-image';
            img.onload = () => { infoImageContainer.innerHTML = ''; infoImageContainer.appendChild(img); };
            img.onerror = () => { infoImageContainer.innerHTML = `<a class="info-link" href="${ev.imageUrl}" target="_blank" rel="noopener noreferrer">이미지 보기</a>`; };
            infoImageContainer.appendChild(img);
        }
    }

    const profs = document.getElementById('infoProfiles');
    if (profs) {
        profs.innerHTML = '';
        if (ev.members) {
            ev.members.split(',').forEach(nameRaw => {
                const name = nameRaw.trim(); if (!name) return;
                const m = members[name] || { name, img: `https://placehold.co/100x100?text=${encodeURIComponent(name[0] || '')}` };
                const card = document.createElement('div'); card.className = 'profile-card';
                card.innerHTML = `<img src="${m.img}" class="profile-img" onerror="this.src='https://placehold.co/100x100?text=?'"><div class="profile-name">${m.name}</div>`;
                profs.appendChild(card);
            });
        }
    }

    let noticePreview = document.getElementById('infoNoticePreview');
    if (!noticePreview) {
        noticePreview = document.createElement('div'); noticePreview.id = 'infoNoticePreview'; noticePreview.className = 'notice-preview'; noticePreview.style.display = 'none';
        const infoBlock = document.querySelector('.info-block'); if(infoBlock) infoBlock.appendChild(noticePreview);
    }
    
    if (ev.noticeLink) {
        noticePreview.style.display = 'block';
        noticePreview.innerHTML = `
            <a href="${ev.noticeLink}" target="_blank" class="btn btn-save" style="display: block; text-decoration: none; padding: 15px; border-radius: 12px; background: #BFDBFE; color: #1E3A8A; text-align: center; font-weight: 800;">공지보기 ↗</a>
        `;
    } else {
        if(noticePreview) noticePreview.style.display = 'none';
    }
    
    const modal = document.getElementById('infoModal'); if(modal) modal.style.display = 'flex';
}

function updateSummary() {
    const today = new Date(); const id = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    const cont = document.getElementById('summaryContent'); if(!cont) return;
    cont.innerHTML = '';
    
    const allEventsRaw = Object.values(events).flat();
    const allEvents = Array.from(new Map(allEventsRaw.map(item => [item.id, item])).values());
    const todayLocal = new Date();
    todayLocal.setHours(0,0,0,0);

    const todaysEvents = allEvents.filter(ev => {
        if (!ev.startDate) return ev.dateId === id;
        const start = new Date(ev.startDate); const end = new Date(ev.endDate);
        start.setHours(0,0,0,0); end.setHours(0,0,0,0);
        return todayLocal >= start && todayLocal <= end;
    });

    todaysEvents.sort((a, b) => {
        if (a.time && b.time) {
            if (a.time !== b.time) return a.time.localeCompare(b.time);
        } else if (a.time && !b.time) {
            return 1;
        } else if (!a.time && b.time) {
            return -1;
        }
        return (a.order ?? 9999) - (b.order ?? 9999);
    });

    if (todaysEvents.length > 0) {
        todaysEvents.forEach((ev, idx) => {
            const item = document.createElement('div'); 
            item.className = `summary-item type-${ev.type}`; 
            item.onclick = () => showInfoByEvent(ev);
            item.innerHTML = `<span class="summary-title">${ev.title}</span>${ev.time ? `<span class="summary-time">${formatTime12h(ev.time)}</span>` : ''}`;
            cont.appendChild(item);
        });
    } else cont.innerHTML = "<p class='text-gray-400 font-bold'>오늘은 일정이 없습니다.</p>";
}

window.toggleMemo = function(btn) {
    const memoPanel = document.getElementById('memoPanel');
    const upPanel = document.getElementById('upPanel');

    memoPanel.classList.toggle('active');
    
    if (memoPanel.classList.contains('active')) {
        upPanel.classList.remove('active');
        updateMemoTabUI();
        loadMemos();
    }
};

window.toggleUpBoard = function(btn) {
    const memoPanel = document.getElementById('memoPanel');
    const upPanel = document.getElementById('upPanel');

    const isUpActive = upPanel.classList.toggle('active');

    if (isUpActive) {
        memoPanel.classList.remove('active');
        loadUpItems();
    }
};

function selectMemoTab(tab) { activeMemoTab = tab; updateMemoTabUI(); loadMemos(); }
function updateMemoTabUI() { document.querySelectorAll('.memo-tab').forEach(btn => btn.classList.toggle('memo-tab-active', btn.dataset.tab === activeMemoTab)); }
function openMemoInput() { if (!isAdmin) return; document.getElementById('memoInputArea').classList.remove('hidden'); document.getElementById('memoItemText').focus(); }
function closeMemoInput() {
    const input = document.getElementById('memoItemText'); if (input) input.value = '';
    document.getElementById('memoDateInput').value = ''; document.getElementById('memoTimeInput').value = '';
    document.getElementById('memoInputArea').classList.add('hidden');
}

async function saveMemoItem() {
    if (!isAdmin) return;
    const input = document.getElementById('memoItemText'); const dateInput = document.getElementById('memoDateInput'); const timeInput = document.getElementById('memoTimeInput');
    const text = input.value.trim(); const dateVal = dateInput.value; const timeVal = timeInput.value;
    if (!text) return showToast('메모 내용을 입력하세요.');
    try {
        await addDoc(collection(db, 'memos_list'), { text, tab: activeMemoTab, date: dateVal, time: timeVal, createdAt: new Date() });
        input.value = ''; dateInput.value = ''; timeInput.value = ''; closeMemoInput(); loadMemos(); showToast('메모가 추가되었습니다.');
    } catch (error) { console.error('메모 추가 실패:', error); showToast('메모 추가에 실패했습니다.'); }
}

async function loadMemos() {
    const list = document.getElementById('memoList'); if(!list) return;
    list.innerHTML = ''; const currentLoad = ++memoLoadToken;
    const snapshot = await getDocs(collection(db, "memos_list"));
    if (currentLoad !== memoLoadToken) return;
    let memos = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.tab === activeMemoTab) memos.push({ id: docSnap.id, ...data });
    });

    memos.sort((a, b) => {
        const hasDateTimeA = !!(a.date || a.time); const hasDateTimeB = !!(b.date || b.time);
        if (hasDateTimeA && hasDateTimeB) {
            const dtA = `${a.date || '9999-12-31'}T${a.time || '23:59'}`;
            const dtB = `${b.date || '9999-12-31'}T${b.time || '23:59'}`;
            return dtA.localeCompare(dtB); 
        } else if (hasDateTimeA && !hasDateTimeB) return -1; 
        else if (!hasDateTimeA && hasDateTimeB) return 1;
        else return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
    });
    
    memos.forEach(data => {
        let dateTimeStr = '';
        if (data.date || data.time) {
            let parts = [];
            if (data.date) {
                const dParts = data.date.split('-');
                if(dParts.length === 3) parts.push(`${dParts[0].slice(-2)}.${dParts[1]}.${dParts[2]}`);
                else parts.push(data.date);
            }
            if (data.time) parts.push(formatTime12h(data.time));
            dateTimeStr = `<div class="memo-datetime">${parts.join(' ')}</div>`;
        }
        const entry = document.createElement('div'); entry.className = 'memo-item-entry';
        entry.innerHTML = `<div class="memo-content-wrapper">${dateTimeStr}<div class="memo-text-content">${data.text}</div></div>${isAdmin ? `<button class="memo-item-delete" onclick="deleteMemo('${data.id}')">✕</button>` : ''}`;
        list.appendChild(entry);
    });
}

window.deleteMemo = async (id) => {
    if (!isAdmin) { showToast('관리자만 삭제할 수 있습니다.'); return; }
    if(confirm('이 메모를 삭제하시겠습니까?')) {
        try { deleteDoc(doc(db, "memos_list", id)); loadMemos(); showToast('메모가 삭제되었습니다.'); }
        catch (error) { console.error('메모 삭제 실패:', error); showToast('메모 삭제에 실패했습니다.'); }
    }
};

window.saveUpItem = async function() {
    if (!isAdmin) return;
    const title = document.getElementById('upTitleInput').value.trim();
    const link = document.getElementById('upLinkInput').value.trim();
    const deadline = document.getElementById('upDeadlineInput').value;

    if (!title) return showToast('컨텐츠 이름을 입력하세요.');
    if (!link) return showToast('링크를 입력하세요.');

    try {
        await addDoc(collection(db, 'up'), { title, link, deadline, createdAt: new Date() });
        document.getElementById('upTitleInput').value = '';
        document.getElementById('upLinkInput').value = '';
        document.getElementById('upDeadlineInput').value = '';
        loadUpItems();
        showToast('UP 항목이 추가되었습니다.');
    } catch (error) { showToast('저장 실패: ' + error.message); }
};

window.loadUpItems = async function() {
    const list = document.getElementById('upList'); if(!list) return;
    try {
        const snapshot = await getDocs(collection(db, 'up'));
        list.innerHTML = '';
        if (snapshot.empty) {
            return;
        }

        let items = [];
        snapshot.forEach(docSnap => { items.push({ id: docSnap.id, ...docSnap.data() }); });
        
        items.sort((a, b) => {
            if(a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
            return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
        });

        const todayLocal = new Date();
        const presidentialStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
        
        let renderCount = 0;

        items.forEach(data => {
            if (data.deadline && data.deadline < presidentialStr) return;
            
            renderCount++;
            const entry = document.createElement('div');
            entry.className = 'up-item-card';
            entry.style.cssText = "background: #ffffff; border: 2px solid #bae6fd; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-radius: 12px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; cursor: pointer;";
            entry.onmouseover = () => entry.style.background = "#e0f2fe";
            entry.onmouseout = () => entry.style.background = "#ffffff";

            let deadlineText = '';
            if (data.deadline) {
                const parts = data.deadline.split('-');
                if (parts.length === 3) deadlineText = `<div style="color: #64748b; font-size: 11px; font-weight: 600; margin-top: 4px; font-family: 'Cafe24SurroundAir', sans-serif;">${parts[1]}.${parts[2]} 마감</div>`;
            }
            entry.innerHTML = `
                <div style="flex: 1;" onclick="window.open('${data.link}', '_blank')">
                    <div style="font-weight: 800; color: #1e293b; font-size: 16px; font-family: 'Cafe24SurroundAir', sans-serif;">${data.title}</div>
                    ${deadlineText}
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <a href="${data.link}" target="_blank" style="color: #0284c7; display: flex; align-items: center;" onclick="event.stopPropagation()">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
                    </a>
                    ${isAdmin ? `<button onclick="event.stopPropagation(); deleteUpItem('${data.id}')" style="color: #aaa; font-weight: bold; cursor: pointer; border: none; background: none;">✕</button>` : ''}
                </div>
            `;
            list.appendChild(entry);
        });

        if (renderCount === 0) {
            list.innerHTML = '<p style="text-align:center; color:#94A3B8; padding: 20px; font-family:\'GMarketSans\';">현재 진행중인 컨텐츠가 없습니다.</p>';
        }
    } catch (error) { console.error("데이터 로드 중 에러 발생:", error); }
};

window.deleteUpItem = async function(id) {
    if (!isAdmin) return;
    if(confirm('이 항목을 삭제하시겠습니까?')) {
        try { deleteDoc(doc(db, "up", id)); showToast('항목이 삭제되었습니다.'); await loadUpItems(); }
        catch (error) { console.error('삭제 실패:', error); showToast('삭제에 실패했습니다.'); }
    }
};

window.closeUpPopup = function() {
    const isChecked = document.getElementById('hidePopupToday')?.checked;
    if (isChecked) {
        const today = new Date().toDateString();
        localStorage.setItem('hideUpPopupDate', today);
    }
    const modal = document.getElementById('upPopupModal');
    if (modal) modal.style.display = 'none';
};

window.checkAndShowPopup = async function() {
    const hideDate = localStorage.getItem('hideUpPopupDate');
    const today = new Date().toDateString();
    if (hideDate === today) return;
    const popupList = document.getElementById('popupUpList');
    if (!popupList) return;

    try {
        let popupImageUrl = '';
        try {
            const settingsSnap = await getDoc(doc(db, 'settings', 'popup'));
            if (settingsSnap.exists()) popupImageUrl = settingsSnap.data().imageUrl || '';
        } catch(e) {}

        const snapshot = await getDocs(collection(db, 'up'));
        
        if (!snapshot.empty || popupImageUrl) {
            let items = [];
            snapshot.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
            
            items.sort((a, b) => {
                if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
                return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
            });
            
            popupList.innerHTML = `<div style="font-family: 'OngleipParkDahyeon', sans-serif; font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 15px; color: #1E3A8A;">UP하라구!</div>`;
            
            if (popupImageUrl) {
                popupList.innerHTML += `<div style="margin-bottom: 16px;"><img src="${popupImageUrl}" style="width: 100%; height: auto; border-radius: 12px; display: block;" alt="Notice Image"></div>`;
            }

            const todayLocal = new Date();
            const presidentialStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
            
            items.forEach(data => {
                if (data.deadline && data.deadline < presidentialStr) return;

                let deadlineText = '';
                if (data.deadline) {
                    const parts = data.deadline.split('-');
                    if (parts.length === 3) deadlineText = `<div style="color: #64748b; font-size: 12px; font-weight: 600; margin-top: 4px; font-family: 'Cafe24SurroundAir', sans-serif;">${parts[1]}.${parts[2]} 마감</div>`;
                }
                
                popupList.innerHTML += `
                    <div class="up-item-card" style="background: #ffffff; border: 2px solid #bae6fd; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-radius: 12px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; cursor: pointer;" onclick="window.open('${data.link}', '_blank')" onmouseover="this.style.background='#e0f2fe'" onmouseout="this.style.background='#ffffff'">
                        <div style="flex: 1;">
                            <div style="font-weight: 800; color: #1e293b; font-size: 15px; font-family: 'Cafe24SurroundAir', sans-serif;">${data.title}</div>
                            ${deadlineText}
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <a href="${data.link}" target="_blank" style="color: #0284c7; display: flex; align-items: center;" onclick="event.stopPropagation()">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
                            </a>
                        </div>
                    </div>
                `;
            });

            if (popupImageUrl || popupList.innerHTML.trim() !== '') {
                document.getElementById('upPopupModal').style.display = 'flex';
            }
        }
    } catch (error) { console.error("Popup UP Load Error:", error); }
};

window.showAdminMenu = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    let menu = document.getElementById('dynamicAdminMenu');
    const targetBtn = e.currentTarget || document.getElementById('adminBtn');
    const rect = targetBtn.getBoundingClientRect();

    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'dynamicAdminMenu';
        menu.style.cssText = 'position:fixed; background:white; border:2px solid #e2e8f0; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:9999; display:flex; flex-direction:column; padding:8px; gap:4px; min-width:140px;';
        
        const btnManage = document.createElement('button');
        btnManage.innerText = '업링크 관리';
        btnManage.style.cssText = 'padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; font-weight:bold; border-radius:8px; font-size:14px; font-family: "GMarketSans";';
        btnManage.onmouseover = () => btnManage.style.background = '#f1f5f9';
        btnManage.onmouseout = () => btnManage.style.background = 'none';
        btnManage.onclick = () => { menu.style.display = 'none'; window.openAdminSettings(); };
        
        const btnChangePw = document.createElement('button');
        btnChangePw.innerText = '암호 변경';
        btnChangePw.style.cssText = 'padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; font-weight:bold; border-radius:8px; font-size:14px; font-family: "GMarketSans";';
        btnChangePw.onmouseover = () => btnChangePw.style.background = '#f1f5f9';
        btnChangePw.onmouseout = () => btnChangePw.style.background = 'none';
        btnChangePw.onclick = () => { menu.style.display = 'none'; window.openPwChangeModal(); };

        const btnLogout = document.createElement('button');
        btnLogout.innerText = '로그아웃';
        btnLogout.style.cssText = 'padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; font-weight:bold; border-radius:8px; color:#ef4444; font-size:14px; font-family: "GMarketSans";';
        btnLogout.onmouseover = () => btnLogout.style.background = '#fef2f2';
        btnLogout.onmouseout = () => btnLogout.style.background = 'none';
        btnLogout.onclick = async () => { 
            menu.style.display = 'none'; 
            if (modifiedDates.size > 0) {
                if (confirm("순서 변경 사항이 있습니다. 저장하시겠습니까?")) await saveAllModifiedOrders();
            }
            isAdmin = false; 
            
            // [중요 가이드라인] 로그아웃 시 현재 세션과 자동 로그인 토글만 파괴하고 프로필 리스트 껍데기는 온전히 유지
            sessionStorage.removeItem('59_admin'); 
            localStorage.removeItem('59_admin_persist');
            
            modifiedDates.clear();
            updateAdminUI(); renderCalendar(); showToast('로그아웃 되었습니다.');
        };
        menu.appendChild(btnManage); menu.appendChild(btnChangePw); menu.appendChild(btnLogout); document.body.appendChild(menu);
    }
    
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        menu.style.bottom = '85px'; 
        menu.style.top = 'auto';
        menu.style.right = '15px';
        menu.style.left = 'auto';
    } else {
        menu.style.top = (rect.bottom + 8) + 'px';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        menu.style.bottom = 'auto';
        menu.style.left = 'auto';
    }
    
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'flex';
        setTimeout(() => {
            const closeMenu = (evt) => {
                if (!menu.contains(evt.target)) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }, 0);
    } else {
        menu.style.display = 'none';
    }
};

window.openAdminSettings = async function() {
    try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'popup'));
        if (settingsSnap.exists()) document.getElementById('popupImageUrlInput').value = settingsSnap.data().imageUrl || '';
        else document.getElementById('popupImageUrlInput').value = '';
    } catch(e) {}
    document.getElementById('popupAdminModal').style.display = 'flex';
};

window.savePopupImage = async function() {
    const imgUrl = document.getElementById('popupImageUrlInput').value.trim();
    try {
        await setDoc(doc(db, 'settings', 'popup'), { imageUrl: imgUrl });
        showToast('팝업 이미지가 설정되었습니다. 새로고침 후 확인하세요.');
    } catch(e) {
        showToast('설정 저장 실패: ' + e.message);
    }
};

window.handlePopupImgUpload = async function(input) {
    if (input.files && input.files[0]) {
        try {
            showToast('팝업 이미지를 서버에 업로드 중입니다...');
            const formData = new FormData();
            formData.append("file", input.files[0]);
            formData.append("upload_preset", "IMG_1234");
            const response = await fetch(`https://api.cloudinary.com/v1_1/dtlqzklk5/image/upload`, { method: "POST", body: formData });
            const data = await response.json();

            if (data.secure_url) {
                document.getElementById('popupImageUrlInput').value = data.secure_url;
                showToast('업로드 완료! [적용] 버튼을 눌러 저장해주세요.');
            }
        } catch (error) {
            console.error(error);
            showToast('이미지 업로드에 실패했습니다.');
        }
    }
};

window.openPwChangeModal = function() {
    document.getElementById('currentPwInput').value = '';
    document.getElementById('newPwInput').value = '';
    document.getElementById('confirmPwInput').value = '';
    const err = document.getElementById('pwChangeError');
    if (err) err.classList.add('hidden');
    document.getElementById('pwChangeModal').style.display = 'flex';
    document.getElementById('currentPwInput').focus();
};

window.changeAdminPassword = async function() {
    const currentPwInput = document.getElementById('currentPwInput').value;
    const newPwInput = document.getElementById('newPwInput').value;
    const confirmPwInput = document.getElementById('confirmPwInput').value;
    const err = document.getElementById('pwChangeError');

    if (!isAdmin || !currentAdminProfile || !currentAdminProfile.docId) {
        if (err) { err.innerText = '로그인 정보가 없습니다.'; err.classList.remove('hidden'); }
        return;
    }

    try {
        const adminDocRef = doc(db, 'admins', currentAdminProfile.docId);
        const adminDocSnap = await getDoc(adminDocRef);

        if (!adminDocSnap.exists()) {
            if (err) { err.innerText = '관리자 정보를 찾을 수 없습니다.'; err.classList.remove('hidden'); }
            return;
        }

        const adminData = adminDocSnap.data();

        if (currentPwInput !== adminData.pw) {
            if (err) { err.innerText = '현재 비밀번호가 일치하지 않습니다.'; err.classList.remove('hidden'); }
            return;
        }
        if (!newPwInput) {
            if (err) { err.innerText = '새 비밀번호를 입력해주세요.'; err.classList.remove('hidden'); }
            return;
        }
        if (newPwInput !== confirmPwInput) {
            if (err) { err.innerText = '새 비밀번호와 확인이 일치하지 않습니다.'; err.classList.remove('hidden'); }
            return;
        }

        const btn = document.querySelector('#pwChangeModal .btn-save');
        if(btn) btn.innerText = '저장 중...';
        await updateDoc(adminDocRef, { pw: newPwInput });
        
        isAdmin = false;
        
        let profiles = JSON.parse(localStorage.getItem('59_saved_profiles') || '[]');
        profiles = profiles.filter(p => p.id !== currentAdminProfile.id);
        localStorage.setItem('59_saved_profiles', JSON.stringify(profiles));

        currentAdminProfile = null;
        sessionStorage.removeItem('59_admin_session'); 
        localStorage.removeItem('59_admin_session');
        sessionStorage.removeItem('59_admin'); 
        localStorage.removeItem('59_admin_persist');
        
        updateAdminUI(); 
        renderCalendar(); 
        
        showToast('비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
        closeModal('pwChangeModal');
        if(btn) btn.innerText = '변경';
    } catch(e) {
        console.error("Password change error:", e);
        if (err) { err.innerText = '현재 비밀번호가 일치하지 않습니다.'; err.classList.remove('hidden'); }
    }
};

// 2순위 & 3순위 진입 제어기
window.promptAdmin = async function(e) {
    if (isAdmin) { 
        window.showAdminMenu(e); 
    } else {
        document.getElementById('adminId').value = '';
        document.getElementById('adminPw').value = '';
        const err = document.getElementById('pwError');
        if (err) err.classList.add('hidden'); 
        
        renderProfileLoginArea(); // 호출 시점에 브라우저 내부 Storage 배열을 스캔하여 스위칭 렌더링
        document.getElementById('pwModal').style.display = 'flex'; 
        document.getElementById('adminId').focus();
    }
}

async function saveAllModifiedOrders() {
    showToast('순서를 서버에 저장 중입니다...');
    const updatePromises = [];
    for (const dateId of modifiedDates) {
        const container = document.querySelector(`[data-date-id="${dateId}"] .event-container`) || document.querySelector(`[data-date-id="${dateId}"] .week-events`);
        if (container) {
            const items = container.querySelectorAll('.event-tag');
            items.forEach((item, index) => {
                const docId = item.dataset.id;
                if (docId) updatePromises.push(updateDoc(doc(db, 'events', docId), { order: index }));
            });
        }
    }
    await Promise.all(updatePromises); modifiedDates.clear(); showToast('모든 순서가 저장되었습니다.');
}

window.loginAdmin = async function() {
    const id = document.getElementById('adminId').value.trim();
    const pw = document.getElementById('adminPw').value;
    const err = document.getElementById('pwError');
    const stayLoggedInElement = document.getElementById('keepLoginCheckbox'); // 체크박스 ID 확인
    const stayLoggedIn = stayLoggedInElement ? stayLoggedInElement.checked : false;

    if (!id || !pw) {
        showToast('아이디와 비밀번호를 모두 입력해주세요.');
        if (err) {
            err.innerText = '아이디와 비밀번호를 모두 입력해주세요.';
            err.classList.remove('hidden');
        }
        return;
    }

    try {
        const q = query(collection(db, "admins"), where("id", "==", id));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const adminDoc = querySnapshot.docs[0];
            const adminData = adminDoc.data();

            if (adminData.pw === pw) {
                if (err) err.classList.add('hidden');
        
                const token = btoa(id + '_' + Date.now() + '_secret'); 
                const newProfile = {
                    id: id,
                    docId: adminDoc.id,
                    name: adminData.name || '오구',
                    img: adminData.img || 'https://stimg.sooplive.com/LOGO/be/been11060/been11060.jpg',
                    token: token
                };
                
                let profiles = JSON.parse(localStorage.getItem('59_saved_profiles') || '[]');
                const existingIdx = profiles.findIndex(p => p.id === id);
                if (existingIdx >= 0) profiles[existingIdx] = newProfile;
                else profiles.push(newProfile);
                
                localStorage.setItem('59_saved_profiles', JSON.stringify(profiles));
                
                if (stayLoggedIn) {
                    localStorage.setItem('59_admin_session', newProfile.token);
                } else {
                    sessionStorage.setItem('59_admin_session', newProfile.token);
                }
                
                isAdmin = true;
                currentAdminProfile = newProfile;
                
                closeModal('pwModal'); 
                updateAdminUI(); 
                renderCalendar(); 
                showToast(`${newProfile.name}님 환영합니다.`);
            } else {
                showToast('비밀번호가 일치하지 않습니다.');
                if (err) {
                    err.innerText = '비밀번호가 일치하지 않습니다.';
                    err.classList.remove('hidden');
                }
            }
        } else {
            showToast('등록되지 않은 아이디 입니다.');
            if (err) {
                err.innerText = '등록되지 않은 아이디 입니다';
                err.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error("Login error:", e);
        showToast('로그인 중 오류가 발생했습니다.');
        if (err) {
            err.innerText = '로그인 중 오류가 발생했습니다.';
            err.classList.remove('hidden');
        }
    }
}

window.moveMonth = async function(v) {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        const target = new Date(currentDate);
        const dayNum = target.getDay();
        const diff = target.getDate() - dayNum + (dayNum === 0 ? -6 : 1);
        const monday = new Date(target.setDate(diff));
        monday.setDate(monday.getDate() + (v * 7));
        currentDate = monday;
    } else { currentDate.setMonth(currentDate.getMonth() + v); }
    
    await ensureMonthsLoadedForDate(currentDate);
    const currentScrollY = window.scrollY;
    const grid = document.getElementById('calendarGrid');
    if (grid) grid.style.minHeight = grid.offsetHeight + 'px';
    renderCalendar();
    setTimeout(() => { if (grid) grid.style.minHeight = ''; window.scrollTo(0, currentScrollY); }, 0);
}

function openMonthPicker() { pickerYear = currentDate.getFullYear(); updatePickerUI(); document.getElementById('monthPickerModal').style.display = 'flex'; }
function updatePickerUI() {
    document.getElementById('pickerYearDisplay').innerText = `${pickerYear}년`;
    const grid = document.querySelector('.month-picker-grid'); grid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        const btn = document.createElement('button'); btn.className = 'month-btn'; btn.innerText = `${i + 1}월`;
        if (pickerYear === currentDate.getFullYear() && i === currentDate.getMonth()) btn.classList.add('active');
        btn.onclick = () => selectMonth(i); grid.appendChild(btn);
    }
}

function changePickerYear(offset) { pickerYear += offset; updatePickerUI(); }
window.selectMonth = async function(m) { 
    currentDate.setFullYear(pickerYear); currentDate.setMonth(m); closeModal('monthPickerModal'); 
    await ensureMonthsLoadedForDate(currentDate); renderCalendar(); 
}

function updateAdminUI() {
    document.querySelectorAll('.admin-only-btn').forEach(b => b.classList.toggle('admin-visible', isAdmin));
    const btnAdmin = document.getElementById('adminBtn');
    if (btnAdmin) {
        btnAdmin.classList.toggle('admin-active', isAdmin);
    }
    const memoPanel = document.getElementById('memoPanel');
    if (memoPanel && memoPanel.classList.contains('open')) loadMemos();
    const upPanel = document.getElementById('upPanel');
    if (upPanel && (upPanel.classList.contains('open') || upPanel.classList.contains('show-sheet'))) loadUpItems();
    
    const adminGearIcon = document.getElementById('adminGearIcon');
    const adminProfilePic = document.getElementById('adminProfilePic');
    const adminBtnLabel = document.getElementById('adminBtnLabel');
    if (adminGearIcon && adminProfilePic && adminBtnLabel) {
        if (isAdmin) {
            adminGearIcon.classList.add('hidden');
            adminProfilePic.classList.remove('hidden');
            adminBtnLabel.innerText = '오구';
        } else {
            adminGearIcon.classList.remove('hidden');
            adminProfilePic.classList.add('hidden');
            adminBtnLabel.innerText = '로그인';
        }
    }
}

window.toggleWikiToc = function() {
    const sidebar = document.getElementById('wikiSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
};

window.loadWikiData = async function() {
    try {
        const docSnap = await getDoc(doc(db, 'wiki', 'main'));
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (data.imgUrl) {
                document.getElementById('wikiImgPreview').src = data.imgUrl;
                document.getElementById('wikiImgPreview').style.display = 'block';
                document.getElementById('wikiImageUrlVal').value = data.imgUrl;
            }

            const infoContainer = document.getElementById('wikiInfoContainer');
            infoContainer.innerHTML = '';
            if (data.profileInfo && data.profileInfo.length > 0) {
                data.profileInfo.forEach(info => addWikiInfoRowDirect(info.topic, info.content));
            }

            const tocList = document.getElementById('wikiTocList');
            const catContainer = document.getElementById('wikiDynamicCategories');
            
            tocList.innerHTML = `<li><a href="javascript:void(0);" onclick="document.getElementById('wiki-section-profile').scrollIntoView({behavior: 'smooth'})" style="color: #1e3a8a; font-weight: 800; text-decoration: none; display: block; font-size: 14px;">1. 기본 프로필</a></li>`;
            catContainer.innerHTML = '';
            wikiCategoryCount = 1;

            if (data.categories && data.categories.length > 0) {
                data.categories.forEach(cat => addWikiTocDirect(cat.title, cat.content));
            }
        }
    } catch (e) {
        console.error("위키 데이터 로드 실패", e);
    }
};

window.saveWikiData = async function() {
    showToast('위키 정보를 서버에 저장 중입니다...');
    try {
        const imgUrl = document.getElementById('wikiImageUrlVal').value;
        
        const profileInfo = [];
        document.querySelectorAll('#wikiInfoContainer .wiki-info-row').forEach(row => {
            profileInfo.push({
                topic: row.dataset.topic,
                content: row.dataset.content
            });
        });

        const categories = [];
        document.querySelectorAll('#wikiDynamicCategories section').forEach(sec => {
            categories.push({
                title: sec.dataset.title,
                content: document.getElementById(`wiki-display-${sec.id}`).innerText
            });
        });

        await setDoc(doc(db, 'wiki', 'main'), { imgUrl, profileInfo, categories });
        showToast('위키가 성공적으로 저장되었습니다.');
    } catch (error) {
        console.error("위키 저장 실패:", error);
        showToast('위키 저장에 실패했습니다.');
    }
};

window.toggleWikiGlobalEdit = async function() {
    isWikiEditMode = !isWikiEditMode;
    const btn = document.getElementById('wikiGlobalEditBtn');
    
    if (isWikiEditMode) {
        btn.innerText = '저장 및 종료';
        btn.style.backgroundColor = '#ef4444'; 
        btn.style.color = '#ffffff';
        
        document.querySelectorAll('.wiki-edit-only').forEach(el => {
            if (el.tagName === 'DIV' && el.style.gap) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'block';
            }
        });
    } else {
        btn.innerText = '수정하기';
        btn.style.backgroundColor = ''; 
        btn.style.color = ''; 
        
        document.querySelectorAll('.wiki-edit-only').forEach(el => {
            el.style.display = 'none';
        });
        
        await saveWikiData();
    }
};

window.handleWikiImgUpload = async function(input) {
    if (!isWikiEditMode) return;
    if (input.files && input.files[0]) {
        try {
            showToast('위키 이미지를 서버에 업로드 중입니다...');
            const formData = new FormData();
            formData.append("file", input.files[0]);
            formData.append("upload_preset", "IMG_1234");
            const response = await fetch(`https://api.cloudinary.com/v1_1/dtlqzklk5/image/upload`, { method: "POST", body: formData });
            const data = await response.json();

            if (data.secure_url) {
                document.getElementById('wikiImageUrlVal').value = data.secure_url;
                document.getElementById('wikiImgPreview').src = data.secure_url;
                document.getElementById('wikiImgPreview').style.display = 'block';
                document.getElementById('wikiImgText').style.display = 'none';
                document.getElementById('wikiImgContainer').style.border = 'none';
                showToast('이미지가 성공적으로 적용되었습니다.');
            }
        } catch (error) {
            console.error(error);
            showToast('이미지 업로드에 실패했습니다.');
        }
    }
};

window.addWikiInfoRow = function() {
    const topic = document.getElementById('infoTopicInput').value.trim();
    const content = document.getElementById('infoContentInput').value.trim();

    if (!topic || !content) {
        alert("주제와 내용을 모두 입력해주세요!");
        return;
    }
    addWikiInfoRowDirect(topic, content);
    document.getElementById('infoTopicInput').value = '';
    document.getElementById('infoContentInput').value = '';
    document.getElementById('infoTopicInput').focus();
};

window.addWikiInfoRowDirect = function(topic, content) {
    const container = document.getElementById('wikiInfoContainer');
    const row = document.createElement('div');
    row.className = 'wiki-info-row';
    row.dataset.topic = topic;
    row.dataset.content = content;
    
    row.style.cssText = "display: flex; gap: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; align-items: center;";
    
    row.innerHTML = `
        <div style="width: 100px; font-weight: 900; color: #1e40af;">${topic}</div>
        <div style="flex: 1; color: #334155; font-weight: bold;">${content}</div>
        <button class="wiki-edit-only" onclick="this.parentElement.remove()" style="color: #ef4444; border: none; background: none; cursor: pointer; font-size: 12px; font-weight: bold; flex-shrink: 0; display: ${isWikiEditMode ? 'block' : 'none'};">삭제</button>
    `;
    container.appendChild(row);
};

window.addWikiToc = function() {
    const tocName = document.getElementById('newTocInput').value.trim();
    if (!tocName) {
        alert("목차 제목을 입력해주세요!");
        return;
    }
    addWikiTocDirect(tocName, "");
    document.getElementById('newTocInput').value = '';
    
    setTimeout(() => {
        const newSection = document.getElementById(`wiki-section-${wikiCategoryCount}`);
        if(newSection) newSection.scrollIntoView({ behavior: 'smooth' });
    }, 100);
};

window.addWikiTocDirect = function(tocName, content) {
    wikiCategoryCount++;
    const sectionId = `wiki-section-${wikiCategoryCount}`;

    const tocList = document.getElementById('wikiTocList');
    const li = document.createElement('li');
    li.id = `toc-link-${sectionId}`;
    
    li.innerHTML = `<a href="javascript:void(0);" onclick="document.getElementById('${sectionId}').scrollIntoView({behavior: 'smooth'})" style="color: #475569; font-weight: 700; text-decoration: none; display: block; font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='#1e3a8a'" onmouseout="this.style.color='#475569'">${wikiCategoryCount}. ${tocName}</a>`;
    tocList.appendChild(li);

    const catContainer = document.getElementById('wikiDynamicCategories');
    const section = document.createElement('section');
    section.id = sectionId;
    section.dataset.title = tocName;
    section.style.cssText = "margin-bottom: 50px;";
    
    section.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; margin-bottom: 15px; padding-bottom: 10px;">
            <h2 style="font-family: 'Cafe24SurroundAir', sans-serif; font-size: 22px; color: #1E3A8A; margin: 0;">${wikiCategoryCount}. ${tocName}</h2>
            <div style="display: ${isWikiEditMode ? 'flex' : 'none'}; gap: 8px;" class="wiki-edit-only">
                <button onclick="openWikiEditModal('${sectionId}', '${tocName}')" class="btn btn-save" style="padding: 6px 14px; font-size: 13px; margin: 0; background-color: #f1f5f9; color: #475569; box-shadow: none;">수정하기</button>
                <button onclick="deleteWikiSection('${sectionId}')" class="btn btn-cancel" style="padding: 6px 14px; font-size: 13px; margin: 0;">삭제</button>
            </div>
        </div>
        <div id="wiki-display-${sectionId}" style="min-height: 50px; color: #334155; line-height: 1.7; white-space: pre-wrap; font-size: 15px;">${content || "이곳에 '"+tocName+"'에 대한 내용을 작성해 주세요."}</div>
    `;
    catContainer.appendChild(section);
};

window.deleteWikiSection = function(sectionId) {
    if(confirm("이 목차와 내부 내용을 모두 삭제하시겠습니까?")) {
        const sec = document.getElementById(sectionId);
        const link = document.getElementById(`toc-link-${sectionId}`);
        if(sec) sec.remove();
        if(link) link.remove();
    }
};

window.openWikiEditModal = function(sectionId, sectionTitle) {
    document.getElementById('editingWikiSectionId').value = sectionId;
    document.getElementById('wikiEditModalTitle').innerText = sectionTitle + " 수정";
    
    const displayDiv = document.getElementById(`wiki-display-${sectionId}`);
    let currentText = displayDiv.innerText;
    
    if (currentText.includes("'에 대한 내용을 작성해 주세요.")) {
        currentText = "";
    }
    
    document.getElementById('wikiEditModalTextarea').value = currentText;
    document.getElementById('wikiEditModal').style.display = 'flex';
};

window.saveWikiEdit = function() {
    const sectionId = document.getElementById('editingWikiSectionId').value;
    const newText = document.getElementById('wikiEditModalTextarea').value;
    
    const displayDiv = document.getElementById(`wiki-display-${sectionId}`);
    displayDiv.innerText = newText.trim() === "" ? "내용이 없습니다." : newText;
    
    displayDiv.innerHTML = newText.replace(/\n/g, '<br>');
    
    closeModal('wikiEditModal');
    showToast('내용이 화면에 수정되었습니다. 우측 상단 [저장 및 종료]를 눌러야 완벽히 저장됩니다.');
};

window.showDayEvents = function(dateId, dayEvents) {
    const modal = document.getElementById('dayModal');
    const titleEl = document.getElementById('dayModalTitle');
    const listEl = document.getElementById('dayModalList');

    if (!modal || !titleEl || !listEl) return;

    const parts = dateId.split('-');
    titleEl.innerText = `${parts[0]}년 ${parts[1]}월 ${parts[2]}일`;

    listEl.innerHTML = '';

    if (!dayEvents || dayEvents.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; color:#94A3B8; font-weight:bold; padding: 40px 0; font-family:\'Escoredream\', sans-serif;">등록된 일정이 없습니다.</div>';
    } else {
        dayEvents.forEach((ev, index) => {
            const item = document.createElement('div');
            
            const isLast = index === dayEvents.length - 1;
            const borderStyle = isLast ? 'padding-bottom: 10px;' : 'border-bottom: 2px dashed #E2E8F0; padding-bottom: 24px; margin-bottom: 24px;';
            
            item.style.cssText = `display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.2s; ${borderStyle}`;
            item.onmouseover = () => item.style.transform = 'scale(1.03)';
            item.onmouseout = () => item.style.transform = 'scale(1)';

            let badgeBorder = '#3B82F6';
            let badgeText = '#3B82F6';
            let badgeBg = '#ffffff';
            
            if (ev.type === '휴방') { badgeBorder = '#94A3B8'; badgeText = '#64748B'; }
            else if (ev.type === '합방') { badgeBorder = '#f6df7a'; badgeText = '#f6c67a'; }
            else if (ev.type === '시네티') { badgeBorder = '#A855F7'; badgeText = '#7E22CE'; }

            item.innerHTML = `
                <div style="font-size: 20px; font-weight: 900; color: #1E3A8A; margin-bottom: 12px; text-align: center; word-break: keep-all; line-height: 1.3;">
                    ${ev.title}
                </div>
                <div style="display: flex; gap: 8px; align-items: center; justify-content: center;">
                    <span style="border: 1.5px solid ${badgeBorder}; color: ${badgeText}; background-color: ${badgeBg}; border-radius: 20px; padding: 4px 14px; font-size: 13px; font-weight: 800;">
                        ${ev.type}
                    </span>
                    ${ev.time ? `<span style="font-size: 14px; color: #64748B; font-weight: 800;">${formatTime12h(ev.time)}</span>` : ''}
                </div>
            `;
            
            item.onclick = (e) => {
                e.stopPropagation();
                closeModal('dayModal');
                showInfoByEvent(ev);
            };
            listEl.appendChild(item);
        });
    }

    modal.style.display = 'flex';
};

window.openDayManageModal = function(dateId) {
    if (!dateId) return;
    document.getElementById('manageDateId').value = dateId;
    const parts = dateId.split('-');
    document.getElementById('dayManageTitle').innerText = `${parts[0]}년 ${parts[1]}월 ${parts[2]}일 관리`;
    
    const listEl = document.getElementById('dayManageList');
    listEl.innerHTML = '';
    
    let dayEvents = events[dateId] || [];
    dayEvents.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    
    if (dayEvents.length === 0) {
        addManageItem(); 
    } else {
        dayEvents.forEach(ev => addManageItem(ev));
    }
    
    document.getElementById('dayManageModal').style.display = 'flex';
    
    if (window.Sortable) {
        if (listEl.sortableInstance) listEl.sortableInstance.destroy();
        listEl.sortableInstance = new Sortable(listEl, {
            handle: '.drag-handle',
            animation: 150
        });
    }
};

window.addManageItem = function(ev = null) {
    const listEl = document.getElementById('dayManageList');
    const item = document.createElement('div');
    item.className = 'manage-event-card';
    item.style.cssText = "background: #f8fafc; padding: 20px; border-radius: 16px; border: 2px solid #e2e8f0; position: relative; margin-bottom: 10px;";
    
    let h = '', m = '', ampm = '오전';
    if (ev && ev.time) {
        const [hr, min] = ev.time.split(':').map(Number);
        ampm = hr >= 12 ? '오후' : '오전';
        h = hr % 12 || 12;
        m = min.toString().padStart(2, '0');
    }

    const currentManageDate = document.getElementById('manageDateId').value;
    const pad = (n) => n.toString().padStart(2, '0');
    let defStart = currentManageDate, defEnd = currentManageDate;
    
    if (currentManageDate) {
        const parts = currentManageDate.split('-');
        const y = parts[0]; const mm = pad(parseInt(parts[1], 10)); const dd = pad(parseInt(parts[2], 10));
        defStart = `${y}-${mm}-${dd}`;
        defEnd = `${y}-${mm}-${dd}`;
    }

    const startVal = ev && ev.startDate ? ev.startDate.split('T')[0] : defStart;
    const endVal = ev && ev.endDate ? ev.endDate.split('T')[0] : defEnd;
    const imgUrl = ev && ev.imageUrl ? ev.imageUrl : '';
    const imgDisplay = imgUrl ? 'block' : 'none';
    
    item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px;">
            <div class="drag-handle" style="cursor: grab; font-size: 16px; color: #1E3A8A; font-weight: 900; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 20px;">≡</span> 드래그하여 순서 변경
            </div>
            <button type="button" onclick="this.closest('.manage-event-card').remove()" style="color: #ef4444; background: #fee2e2; border: none; font-size: 13px; cursor: pointer; font-weight: bold; padding: 6px 12px; border-radius: 8px;">✕ 삭제</button>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
                <label style="display: block; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; font-size: 13px;">일정 제목</label>
                <input type="text" class="m-title admin-input" placeholder="일정 제목을 입력하세요" value="${ev ? (ev.title || '') : ''}" style="padding: 12px; font-size: 14px; width: 100%; box-sizing: border-box;">
            </div>
            
            <div style="display: flex; gap: 12px;">
                <div style="flex: 1;">
                    <label style="display: block; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; font-size: 13px;">시작일</label>
                    <input type="date" class="m-start admin-input" value="${startVal}" style="padding: 10px; width: 100%; box-sizing: border-box;">
                </div>
                <div style="flex: 1;">
                    <label style="display: block; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; font-size: 13px;">종료일</label>
                    <input type="date" class="m-end admin-input" value="${endVal}" style="padding: 10px; width: 100%; box-sizing: border-box;">
                </div>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <div style="flex: 1.2;">
                    <label style="display: block; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; font-size: 13px;">시간</label>
                    <div style="display: flex; gap: 4px;">
                        <select class="m-ampm admin-input" style="padding: 10px; flex: 1;">
                            <option value="오전" ${ampm === '오전' ? 'selected' : ''}>오전</option>
                            <option value="오후" ${ampm === '오후' ? 'selected' : ''}>오후</option>
                        </select>
                        <input type="number" class="m-hour admin-input" placeholder="시" min="1" max="12" value="${h}" style="padding: 10px; flex: 1; text-align: center;">
                        <input type="number" class="m-min admin-input" placeholder="분" min="0" max="59" value="${m}" style="padding: 10px; flex: 1; text-align: center;">
                    </div>
                </div>
                <div style="flex: 0.8;">
                    <label style="display: block; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; font-size: 13px;">유형</label>
                    <select class="m-type admin-input" style="padding: 10px; width: 100%;">
                        <option value="개인방송" ${ev && ev.type === '개인방송' ? 'selected' : ''}>개인방송</option>
                        <option value="합방" ${ev && ev.type === '합방' ? 'selected' : ''}>합방</option>
                        <option value="휴방" ${ev && ev.type === '휴방' ? 'selected' : ''}>휴방</option>
                        <option value="시네티" ${ev && ev.type === '시네티' ? 'selected' : ''}>시네티</option>
                    </select>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <div style="flex: 1;">
                    <label style="display: block; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; font-size: 13px;">멤버 (선택)</label>
                    <input type="text" class="m-members admin-input" placeholder="멤버 태그" value="${ev ? (ev.members || '') : ''}" style="padding: 10px; width: 100%; box-sizing: border-box;">
                </div>
                <div style="flex: 1;">
                    <label style="display: block; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; font-size: 13px;">공지 링크 (선택)</label>
                    <input type="text" class="m-link admin-input" placeholder="https://..." value="${ev ? (ev.noticeLink || '') : ''}" style="padding: 10px; width: 100%; box-sizing: border-box;">
                </div>
            </div>
            
            <div>
                <label style="display: block; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; font-size: 13px;">이미지 등록 (파일 업로드 또는 링크 입력)</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="file" accept="image/*" onchange="handleManageImgUpload(this)" style="font-size: 12px; width: 180px; flex-shrink: 0;">
                    <input type="text" class="m-img-url admin-input" placeholder="이미지 링크(URL)" value="${imgUrl}" oninput="updateManageImgPreview(this)" style="padding: 8px; flex: 1; font-size: 13px; min-width: 100px; margin: 0;">
                    <img class="m-img-preview" src="${imgUrl}" style="display: ${imgDisplay}; max-height: 36px; border-radius: 6px; border: 1px solid #cbd5e1;">
                    <button type="button" class="m-img-remove" onclick="removeManageImg(this)" style="display: ${imgDisplay}; font-size: 12px; color: white; background: #ef4444; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; flex-shrink: 0;">지우기</button>
                </div>
            </div>
        </div>
    `;

    item.dataset.id = ev ? (ev.id || '') : '';
    
    listEl.appendChild(item);
};

window.saveDayManage = async function() {
    const dateId = document.getElementById('manageDateId').value;
    const listEl = document.getElementById('dayManageList');
    const items = listEl.querySelectorAll('.manage-event-card');
    
    const originalEvents = events[dateId] || [];
    const originalIds = originalEvents.map(e => e.id);
    const newIds = [];
    
    showToast('일괄 저장 중입니다...');
    
    try {
        const updatePromises = [];
        
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const docId = item.dataset.id;
            const fullObjStr = item.dataset.fullObj;
            let evData = fullObjStr ? JSON.parse(fullObjStr) : {};
            
            const title = item.querySelector('.m-title').value.trim();
            if (!title) continue; 
            
            const startStr = item.querySelector('.m-start').value;
            const endStr = item.querySelector('.m-end').value;
            const ampm = item.querySelector('.m-ampm').value;
            const hRaw = item.querySelector('.m-hour').value;
            const mRaw = item.querySelector('.m-min').value;
            const type = item.querySelector('.m-type').value;
            const members = item.querySelector('.m-members').value;
            const noticeLink = item.querySelector('.m-link').value;
            const imageUrl = item.querySelector('.m-img-url').value;
            
            let timeStr = '';
            if (hRaw !== '') {
                let h = parseInt(hRaw, 10);
                const m = parseInt(mRaw || '0', 10);
                if (ampm === '오후' && h < 12) h += 12;
                if (ampm === '오전' && h === 12) h = 0;
                timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            }
            
            const normalizedDateId = normalizeDateId(startStr);
            evData = {
                title, time: timeStr, type, members, noticeLink, imageUrl,
                startDate: startStr, endDate: endStr, dateId: normalizedDateId,
                order: index
            };
            
            if (docId) {
                newIds.push(docId);
                updatePromises.push(setDoc(doc(db, 'events', docId), evData));
            } else {
                const safeTitle = title.replace(/\//g, '-'); 
                const customDocId = `${startStr}_${safeTitle}_${Date.now()}_${index}`; 
                updatePromises.push(setDoc(doc(db, 'events', customDocId), evData));
            }
        }
        
        const idsToDelete = originalIds.filter(id => !newIds.includes(id));
        for (const id of idsToDelete) {
            updatePromises.push(deleteDoc(doc(db, 'events', id)));
        }
        
        await Promise.all(updatePromises);
        
        loadedMonths.clear();
        events = {};
        await ensureMonthsLoadedForDate(currentDate);
        renderCalendar();
        closeModal('dayManageModal');
        showToast('일정 관리가 완료되었습니다.');
        
    } catch (error) {
        console.error(error);
        showToast(`저장 실패: ${error.message}`);
    }
};

Object.assign(window, {
    addMember, deleteMember, handlePopupImgUpload: window.handlePopupImgUpload,
    openMemberManager, renderMemberList, showToast, closeModal, formatTime12h,
    setAMPM, showInfo, toggleMemo, openMemoInput, closeMemoInput, saveMemoItem, selectMemoTab, 
    openMonthPicker, changePickerYear, toggleUpBoard, loadUpItems, deleteUpItem,
    promptAdmin, loginAdmin, showAdminMenu, openAdminSettings, savePopupImage, saveUpItem,
    openPwChangeModal: window.openPwChangeModal, changeAdminPassword: window.changeAdminPassword,
    closeUpPopup, checkAndShowPopup, loginWithProfile, removeSavedProfile,
    switchMainTab: window.switchMainTab,
    loadWikiData: window.loadWikiData, saveWikiData: window.saveWikiData,
    toggleWikiGlobalEdit: window.toggleWikiGlobalEdit, triggerWikiImgUpload: window.triggerWikiImgUpload,
    handleWikiImgUpload: window.handleWikiImgUpload, addWikiInfoRow: window.addWikiInfoRow, 
    addWikiInfoRowDirect: window.addWikiInfoRowDirect, addWikiToc: window.addWikiToc, 
    addWikiTocDirect: window.addWikiTocDirect, deleteWikiSection: window.deleteWikiSection,
    openWikiEditModal: window.openWikiEditModal, saveWikiEdit: window.saveWikiEdit,
    toggleWikiToc: window.toggleWikiToc, showDayEvents: window.showDayEvents,
    openDayManageModal: window.openDayManageModal, addManageItem: window.addManageItem,
    saveDayManage: window.saveDayManage, handleManageImgUpload: window.handleManageImgUpload, 
    removeManageImg: window.removeManageImg, updateManageImgPreview: window.updateManageImgPreview
});

document.addEventListener('contextmenu', function(e) {
    if (!isAdmin && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

document.addEventListener('selectstart', function(e) {
    if (!isAdmin && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

document.addEventListener('dragstart', function(e) {
    if (!isAdmin && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

window.onload = async () => {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    try {
        await seedAdmin();
        initAuth();
        await loadData();
        updateAdminUI();
        
        if (window.location.hash === '#wiki') {
            window.switchMainTab('wiki');
        } else {
            window.switchMainTab('calendar');
        }

        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#wiki') {
                window.switchMainTab('wiki');
            } else {
                window.switchMainTab('calendar');
            }
        });

        await ensureMonthsLoadedForDate(currentDate);
        renderCalendar();
                
        window.checkAndShowPopup();

        const sidebar = document.getElementById('wikiSidebar');
        if (sidebar) {
            if (window.innerWidth <= 768) {
                sidebar.classList.add('collapsed'); 
            } else {
                sidebar.classList.remove('collapsed'); 
            }
        }

        document.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
                if (e.target.closest('#wikiTocList a')) {
                    const sidebar = document.getElementById('wikiSidebar');
                    if (sidebar) sidebar.classList.add('collapsed');
                }
            }
        });

        const wikiTextarea = document.getElementById('wikiEditModalTextarea');
        if (wikiTextarea) {
            wikiTextarea.addEventListener('dragover', (e) => {
                e.preventDefault();
                wikiTextarea.style.borderColor = '#3B82F6';
                wikiTextarea.style.backgroundColor = '#F0F9FF';
            });
            wikiTextarea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                wikiTextarea.style.borderColor = '#E5E7EB';
                wikiTextarea.style.backgroundColor = '#ffffff';
            });
            wikiTextarea.addEventListener('drop', async (e) => {
                e.preventDefault();
                wikiTextarea.style.borderColor = '#E5E7EB';
                wikiTextarea.style.backgroundColor = '#ffffff';
                
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    if (file.type.startsWith('image/')) {
                        showToast('이미지를 업로드 중입니다...');
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("upload_preset", "IMG_1234");
                        try {
                            const response = await fetch(`https://api.cloudinary.com/v1_1/dtlqzklk5/image/upload`, { method: "POST", body: formData });
                            const data = await response.json();
                            if (data.secure_url) {
                                const imgTag = `\n<img src="${data.secure_url}" style="max-width: 100%; border-radius: 8px;">\n`;
                                const startPos = wikiTextarea.selectionStart;
                                const endPos = wikiTextarea.selectionEnd;
                                wikiTextarea.value = wikiTextarea.value.substring(0, startPos) + imgTag + wikiTextarea.value.substring(endPos);
                                showToast('이미지가 본문에 추가되었습니다.');
                            }
                        } catch (err) {
                            showToast('이미지 업로드에 실패했습니다.');
                        }
                    }
                }
            });
        }

        let lastWidth = window.innerWidth;
        window.addEventListener('resize', () => {
            if (window.innerWidth !== lastWidth) {
                lastWidth = window.innerWidth;
                renderCalendar();
                
                const sidebar = document.getElementById('wikiSidebar');
                if (sidebar) {
                    if (window.innerWidth <= 768) {
                        sidebar.classList.add('collapsed');
                    } else {
                        sidebar.classList.remove('collapsed');
                    }
                }
            }
        });

    } catch (err) {
        console.error("Initialization error:", err);
        showToast("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
        if (loadingOverlay) { 
            loadingOverlay.classList.add('hidden'); 
            setTimeout(() => { loadingOverlay.remove(); }, 500); 
        }
    }
};