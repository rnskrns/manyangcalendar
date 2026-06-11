import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, addDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
  apiKey: "AIzaSyBXNh8yTfsSviHgv8fRVk0LjpLcWtII2wo",
  authDomain: "manyangcalendar.firebaseapp.com",
  projectId: "manyangcalendar",
  storageBucket: "manyangcalendar.firebasestorage.app",
  messagingSenderId: "722138856168",
  appId: "1:722138856168:web:bb2dadc0a51d220b19a75d",
  measurementId: "G-FTR467Y3WX"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// 로컬 스토리지/세션 스토리지 기반 하이브리드 로그인 상태 관리
let isAdmin = false;
let currentAdminProfile = null;

let dayManagerItems = [];
let dayManagerActiveDateId = '';
let dayManagerFormattedDateId = '';

async function seedAdmin() {
    try {
        const q = query(collection(db, "admins"));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            console.log("관리자 정보가 없어 기본 계정을 생성합니다.");
            const defaultAdmin = {
                id: 'maluckitty',
                pw: '02131126',
                name: '마냥',
                img: 'https://stimg.sooplive.com/LOGO/ma/maluckitty/maluckitty.jpg'
            };
            await addDoc(collection(db, "admins"), defaultAdmin);
            console.log("기본 관리자 계정 생성 완료.");
        }
    } catch (e) {
        console.error("관리자 정보 초기화 오류:", e);
    }
}

/* 하이브리드 로그인 로직 시작 */
function getAdminProfiles() {
    try { 
        let profiles = JSON.parse(localStorage.getItem('sompunch_admin_profiles')) || []; 
        let changed = false;
        // 기존 로컬 스토리지에 남아있는 '솜주먹' 이름을 '마냥'으로 자동 업데이트
        profiles.forEach(p => {
            if (p.name === '솜주먹' || p.id === 'maluckitty') {
                if (p.name !== '마냥') { p.name = '마냥'; changed = true; }
            }
        });
        if (changed) localStorage.setItem('sompunch_admin_profiles', JSON.stringify(profiles));
        return profiles;
    }
    catch { return []; }
}

function saveAdminProfiles(profiles) {
    localStorage.setItem('sompunch_admin_profiles', JSON.stringify(profiles));
}

function initAuth() {
    // 1. 먼저 localStorage 확인 (로그인 유지 체크한 경우)
    let sessionToken = localStorage.getItem('sompunch_admin_session');
    
    // 2. 없으면 sessionStorage 확인 (일반 로그인)
    if (!sessionToken) {
        sessionToken = sessionStorage.getItem('sompunch_admin_session');
    }

    if (sessionToken) {
        const profiles = getAdminProfiles();
        const profile = profiles.find(p => p.token === sessionToken);
        if (profile) {
            isAdmin = true;
            currentAdminProfile = profile;
            updateAdminUI();
            return;
        }
    }
    isAdmin = false;
    currentAdminProfile = null;
    updateAdminUI();
}

window.loginAdmin = async function() {
    const id = document.getElementById('adminId').value.trim();
    const pw = document.getElementById('adminPw').value;
    const err = document.getElementById('pwError');
    
    const stayLoggedInElement = document.getElementById('stayLoggedIn');
    const stayLoggedIn = stayLoggedInElement ? stayLoggedInElement.checked : false;

    if (!id || !pw) {
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
                    name: adminData.name || '마냥',
                    img: adminData.img || 'https://stimg.sooplive.com/LOGO/ma/maluckitty/maluckitty.jpg',
                    token: token
                };
                
                let profiles = getAdminProfiles();
                const existingIdx = profiles.findIndex(p => p.id === id);
                if (existingIdx >= 0) profiles[existingIdx] = newProfile;
                else profiles.push(newProfile);
                
                saveAdminProfiles(profiles);
                
                if (stayLoggedIn) {
                    localStorage.setItem('sompunch_admin_session', newProfile.token);
                } else {
                    sessionStorage.setItem('sompunch_admin_session', newProfile.token);
                }
                
                isAdmin = true;
                currentAdminProfile = newProfile;
                updateAdminUI();
                renderCalendar();
                
                document.getElementById('adminId').value = '';
                document.getElementById('adminPw').value = '';
                closeModal('pwModal');
                showToast(`${newProfile.name}님 환영합니다.`);
            } else {
                if (err) {
                    err.innerText = '비밀번호가 일치하지 않습니다.';
                    err.classList.remove('hidden');
                }
            }
        } else {
            if (err) {
                err.innerText = '등록되지 않은 아이디 입니다';
                err.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error("Login error:", e);
        if (err) {
            err.innerText = '로그인 중 오류가 발생했습니다.';
            err.classList.remove('hidden');
        }
    }
}

window.loginWithProfile = function(token) {
    let profiles = getAdminProfiles();
    const profile = profiles.find(p => p.token === token);
    
    if (profile && token !== 'expired') {
        setAdminSession(profile);
        closeModal('pwModal');
        showToast(`${profile.name}님 환영합니다.`);
    } else {
        profiles = profiles.filter(p => p.token !== token && p.token !== 'expired');
        saveAdminProfiles(profiles);
        
        showToast('인증이 만료되었습니다. 다시 로그인해 주세요.');
        renderAdminProfiles();
    }
}

function setAdminSession(profile) {
    // 프로필 클릭 로그인은 '로그인 유지'를 의도한 것으로 간주하고 localStorage에 저장합니다.
    localStorage.setItem('sompunch_admin_session', profile.token);
    
    isAdmin = true;
    currentAdminProfile = profile;
    updateAdminUI();
    renderCalendar();
}

window.deleteAdminProfile = function(event, id) {
    event.stopPropagation();
    let profiles = getAdminProfiles();
    profiles = profiles.filter(p => p.id !== id);
    saveAdminProfiles(profiles);
    renderAdminProfiles();
}

window.renderAdminProfiles = function() {
    const profiles = getAdminProfiles();
    const area = document.getElementById('profileSelectionArea');
    const list = document.getElementById('adminProfileList');
    
    if (!area || !list) return;
    
    if (profiles.length > 0) {
        area.style.display = 'block';
        list.innerHTML = '';
        profiles.forEach(p => {
            const div = document.createElement('div');
            div.className = 'admin-profile-item';
            div.style.cssText = 'display: flex; flex-direction: column; align-items: center; cursor: pointer;';
            div.onclick = () => loginWithProfile(p.token);
            div.innerHTML = `
                <div style="position:relative; width: 50px; height: 50px; border-radius: 30px;" 
                     onmouseenter="this.querySelector('.profile-delete-btn').style.display='flex'" 
                     onmouseleave="this.querySelector('.profile-delete-btn').style.display='none'">
                    <img src="${p.img}" alt="${p.name}" style="width: 100%; height: 100%; border-radius: 30px; object-fit: cover; border: 2px solid #7ca349;">
                    <button class="profile-delete-btn" onclick="deleteAdminProfile(event, '${p.id}')" style="position:absolute; top:-5px; right:-5px; background:#ef4444; color:white; border:none; border-radius:30px; width:20px; height:20px; font-size:10px; cursor:pointer; display:none; align-items:center; justify-content:center; padding:0;">✕</button>
                </div>
                <span class="profile-item-name" style="font-size:13px; font-weight:bold; color:#7A5A2F; margin-top: 6px;">${p.name}</span>
            `;
            list.appendChild(div);
        });
    } else {
        area.style.display = 'none';
    }
}

let modifiedDates = new Set();
let currentDate = new Date();
let events = {};
let loadedMonths = new Set();
let members = {};
let currentAMPM = '오전';
let activeMemoTab = '메모';
let activeDateId = '';
let pickerYear = currentDate.getFullYear();
let memoLoadToken = 0;

let globalServerLastUpdated = null;

async function getServerLastUpdated() {
    if (globalServerLastUpdated !== null) return globalServerLastUpdated;
    try {
        const statusSnap = await getDoc(doc(db, 'settings', 'db_status'));
        if (statusSnap.exists()) {
            globalServerLastUpdated = statusSnap.data().lastUpdated || 0;
        } else {
            globalServerLastUpdated = 0;
        }
    } catch(e) {
        globalServerLastUpdated = 0;
    }
    return globalServerLastUpdated;
}

async function updateDbStatus() {
    try {
        const now = new Date().getTime();
        await setDoc(doc(db, 'settings', 'db_status'), { lastUpdated: now });
        globalServerLastUpdated = now; 
    } catch(e) { console.error("상태 업데이트 실패:", e); }
}

function updateBoardButtonsState() {
    const memoOpen = document.getElementById('memoPanel')?.classList.contains('open') || document.getElementById('memoPanel')?.classList.contains('show-sheet');
    const upOpen = document.getElementById('upPanel')?.classList.contains('open') || document.getElementById('upPanel')?.classList.contains('show-sheet');
    
    document.querySelectorAll('button[onclick*="toggleMemo"], button[onclick*="toggleMobileMemo"]').forEach(b => {
        b.classList.toggle('board-active', !!memoOpen);
    });
    document.querySelectorAll('button[onclick*="toggleUpBoard"], button[onclick*="toggleMobileUpBoard"]').forEach(b => {
        b.classList.toggle('board-active', !!upOpen);
    });
}

window.extractYtId = function(url) {
    if(!url) return null;
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : null;
};

window.loadNoticePreview = async function(url, container, manualTitle, manualDesc) {
    if (!url || !container) return;
    container.style.display = 'block';

    if (manualTitle) {
        renderNoticeHTML(container, url, manualTitle, manualDesc);
        return;
    }
    
    const cacheDocId = btoa(url.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50)); 
    const noticeRef = doc(db, 'notice_cache', cacheDocId);
    
    try {
        const cacheSnap = await getDoc(noticeRef);
        if (cacheSnap.exists()) {
            const data = cacheSnap.data();
            renderNoticeHTML(container, url, data.title, data.description);
            return;
        }
    } catch (e) {
        console.warn("DB 조회 실패");
    }

    container.innerHTML = '<div class="preview-loading" style="padding: 20px; text-align: center; color: #A09586; font-weight: 800;">공지 정보를 불러오는 중...</div>';

    try {
        const response = await fetch(`/api/get-notice?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        
        if (response.ok && data.title) {
            const finalData = { title: data.title, description: data.description || '' };
            await setDoc(noticeRef, { ...finalData, createdAt: new Date() });
            renderNoticeHTML(container, url, finalData.title, finalData.description);
        } else {
            throw new Error();
        }
    } catch (error) {
        container.innerHTML = `
            <div style="margin-top: 15px; text-align: center;">
                <p style="color: #ef4444; font-size: 13px; font-weight: 800; margin-bottom: 10px;"></p>
                <a href="${url}" target="_blank" class="btn btn-save" style="display: block; text-decoration: none; padding: 15px; border-radius: 12px; background: #FFF3B0; color: #7A5A2F;">공지 원문 보러가기</a>
            </div>
        `;
    }
};

function renderNoticeHTML(container, url, title, desc) {
    container.innerHTML = `
        <a href="${url}" target="_blank" rel="noreferrer" class="premium-notice-card">
            <div class="premium-notice-header">
                <span class="premium-notice-badge">공지사항</span>
                <span class="premium-notice-date">바로가기 ↗</span>
            </div>
            <h3 class="premium-notice-title">${title}</h3>
            ${desc ? `<p class="premium-notice-desc">${desc}</p>` : ''}
        </a>
    `;
}

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

async function handleEventImgUpload(input) {
    if (input.files && input.files[0]) {
        try {
            const file = input.files[0];
            showToast('일정 이미지를 업로드 중입니다...');
            const cloudName = "dtlqzklk5";
            const uploadPreset = "IMG_1234";

            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", uploadPreset);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                method: "POST",
                body: formData
            });

            const data = await response.json();

            if (data.secure_url) {
                document.getElementById('eventImageUrl').value = data.secure_url;
                const preview = document.getElementById('eventImagePreview');
                const removeBtn = document.getElementById('removeImageBtn');
                const placeholder = document.getElementById('eventImagePlaceholder');
                
                if (preview && removeBtn) {
                    preview.src = data.secure_url;
                    preview.style.display = 'block';
                    removeBtn.style.display = 'inline-block';
                    if (placeholder) placeholder.style.display = 'none';
                }
                showToast('이미지가 성공적으로 업로드되었습니다.');
            } else {
                throw new Error(data.error?.message || 'Cloudinary 응답 오류');
            }
        } catch (error) {
            console.error(error);
            showToast('일정 이미지 업로드에 실패했습니다.');
        }
    }
}

window.removeEventImage = function() {
    document.getElementById('eventImageUrl').value = '';
    document.getElementById('eventImgFile').value = '';
    
    const preview = document.getElementById('eventImagePreview');
    const removeBtn = document.getElementById('removeImageBtn');
    const placeholder = document.getElementById('eventImagePlaceholder');
    
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    if (removeBtn) removeBtn.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
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

function ensureMemberModal() {
    const existing = document.getElementById('memberModal');
    if (existing && existing.dataset.injected === 'true') return;
    if (existing) existing.remove();

    const html = `
    <div id="memberModal" data-injected="true" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; backdrop-filter:blur(2px);">
        <div style="background:#fff; padding:32px 40px; border-radius:30px; display:flex; flex-direction:column; gap:16px; min-width:320px; max-width:420px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
            <h2 style="margin:0; font-family:'TMoneyDungunbaram', sans-serif; color:#7A5A2F; font-size:24px; text-align:center;">멤버 관리</h2>
            
            <div id="memberList" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-top: 10px;"></div>
            
            <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
            
            <div style="display:flex; flex-direction:column; gap:8px;">
                <label style="font-weight:bold; color:#7A5A2F;">새 멤버 추가</label>
                <input type="text" id="newMemberName" placeholder="멤버 이름 (닉네임)" style="width:100%; padding:12px; border-radius:30px; border:1px solid #ddd; outline:none; font-weight:bold; box-sizing:border-box;">
                <input type="text" id="newMemberId" placeholder="SOOP 아이디" style="width:100%; padding:12px; border-radius:30px; border:1px solid #ddd; outline:none; font-weight:bold; margin-bottom:4px; box-sizing:border-box;">
                <button onclick="addMember()" style="width:100%; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#7ca349; color:white; font-weight:bold; font-size:15px;">추가하기</button>
            </div>
            
            <button onclick="closeModal('memberModal')" style="width:100%; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#f1f5f9; color:#64748b; font-weight:bold; font-size:15px; margin-top:4px;">닫기</button>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

async function openMemberManager() { 
    if (!isAdmin) {
        showToast('관리자만 멤버를 관리할 수 있습니다.');
        return;
    }

    try {
        ensureMemberModal();
        await loadMembersFromFirebase();
        renderMemberList();
        const memberModal = document.getElementById('memberModal');
        if (memberModal) {
            memberModal.style.setProperty('display', 'flex', 'important');
        } else {
            showToast('멤버 관리 모달을 찾을 수 없습니다.');
        }
    } catch (error) {
        console.error('멤버 관리자 열기 오류:', error);
        showToast('멤버 관리를 열 수 없습니다.');
    }
}

function renderMemberList() {
    const list = document.getElementById('memberList');
    if (!list) return;
    list.innerHTML = '';
    Object.values(members).forEach(m => {
        const item = document.createElement('div');
        item.className = 'member-list-item';
        item.style.cssText = 'display: flex; align-items: center; gap: 15px; padding: 12px; background: #f8fafc; border-radius: 30px; border: 1px solid #e2e8f0;';
        item.innerHTML = `
            <img src="${m.img}" class="member-img-preview" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; background: #EEE;" onerror="this.src='https://placehold.co/100x100?text=?'">
            <div style="flex:1; font-weight:800; color:#7A5A2F;">${m.name}</div>
            <button style="color: #ef4444; font-weight: bold; background: none; border: none; cursor: pointer; padding: 4px 8px; font-size: 14px;" onclick="deleteMember('${m.name}')">삭제</button>
        `;
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
    if(el) {
        el.style.removeProperty('display');
        el.style.display = 'none'; 
    }
}

function parseTimeStr(timeStr) {
    if (!timeStr) return { ampm: '오전', hour: '', min: '' };
    const [h24, m] = timeStr.split(':').map(n => parseInt(n) || 0);
    const ampm = h24 >= 12 ? '오후' : '오전';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { ampm, hour: h12, min: m };
}

window.setMgrAmPm = function(btn, type) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.mgr-ampm-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

function formatTime12h(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    return `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${m.toString().padStart(2, '0')}`;
}

function setAMPM(val) {
    currentAMPM = val;
    const amBtn = document.getElementById('ampmAM');
    const pmBtn = document.getElementById('ampmPM');
    if (amBtn) amBtn.classList.toggle('active', val === '오전');
    if (pmBtn) pmBtn.classList.toggle('active', val === '오후');
}

async function loadMembersFromFirebase() {
    members = {};
    const snapshot = await getDocs(collection(db, 'members'));
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!data || !data.name) return;
        members[data.name] = { name: data.name, img: data.img || `https://placehold.co/100x100/FFD54F/ffffff?text=${encodeURIComponent(data.name[0] || '')}` };
    });
}

async function loadEventsForMonth(year, month) {
    const monthKey = `${year}-${month}`;
    if (loadedMonths.has(monthKey)) return;

    const serverTime = await getServerLastUpdated();
    const localCache = JSON.parse(localStorage.getItem('htvvi_events_cache') || '{"time": 0, "data": []}');
    let docs = [];

    if (localCache.time >= serverTime && localCache.data.length > 0 && serverTime !== 0) {
        docs = localCache.data;
    } else {
        const snapshot = await getDocs(collection(db, 'events'));
        snapshot.forEach(docSnap => docs.push({ ...docSnap.data(), id: docSnap.id }));
        localStorage.setItem('htvvi_events_cache', JSON.stringify({ time: serverTime || new Date().getTime(), data: docs }));
    }

    events = {};
    docs.forEach(data => {
        const sDate = data.startDate || data.dateId;
        if (!events[sDate]) events[sDate] = [];
        events[sDate].push(data);
    });
    loadedMonths.add(monthKey);
}

async function ensureMonthsLoadedForDate(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    await loadEventsForMonth(y, m);

    const isMobile = window.innerWidth < 1050;
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
        try { await loadUpItems(); } catch (e) { console.log("UP 컬렉션 로드 실패:", e); }
    } catch (error) { console.error("데이터 로드 오류:", error); }
    const overlay = document.getElementById('loadingOverlay');
    if(overlay) overlay.classList.add('hidden');
}

function resetImagePreviewUI(imgUrl) {
    const preview = document.getElementById('eventImagePreview');
    const removeBtn = document.getElementById('removeImageBtn');
    const placeholder = document.getElementById('eventImagePlaceholder');

    if (preview && removeBtn) {
        if (imgUrl) {
            preview.src = imgUrl;
            preview.style.display = 'block';
            removeBtn.style.display = 'inline-block';
            if (placeholder) placeholder.style.display = 'none';
        } else {
            preview.src = '';
            preview.style.display = 'none';
            removeBtn.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
        }
    }
}

function openAddModal(id) {
    activeDateId = id; document.getElementById('modalTitle').innerText = '일정 추가';
    document.getElementById('editIndex').value = '-1';
    if (document.getElementById('editingEventDocId')) document.getElementById('editingEventDocId').value = '';
    document.getElementById('eventTitle').value = '';
    document.getElementById('timeHour').value = ''; document.getElementById('timeMin').value = '';
    document.getElementById('eventImageUrl').value = ''; document.getElementById('eventImgFile').value = '';
    document.getElementById('eventMembers').value = ''; 
    document.getElementById('eventType').value = '개인방송';
    
    resetImagePreviewUI('');
    
    const pad = (n) => n.toString().padStart(2, '0');
    if (document.getElementById('eventStartDate')) {
        const parts = id.split('-');
        const y = parts[0]; const m = pad(parseInt(parts[1], 10)); const d = pad(parseInt(parts[2], 10));
        document.getElementById('eventStartDate').value = `${y}-${m}-${d}`;
        document.getElementById('eventEndDate').value = `${y}-${m}-${d}`;
    }
    setAMPM('오전'); document.getElementById('delBtn').style.display = 'none';
    document.getElementById('eventModal').style.display = 'flex';
}

async function saveEvent() {
    if (!isAdmin) return;

    const titleInput = document.getElementById('eventTitle');
    const startDateInput = document.getElementById('eventStartDate');
    const endDateInput = document.getElementById('eventEndDate');
    const hourInput = document.getElementById('timeHour');
    const minInput = document.getElementById('timeMin');
    const typeInput = document.getElementById('eventType');
    const membersInput = document.getElementById('eventMembers');
    const imageUrlInput = document.getElementById('eventImageUrl');
    const editingIdInput = document.getElementById('editingEventDocId');

    if (!titleInput || !startDateInput || !endDateInput || !hourInput || !minInput || !typeInput || !membersInput || !imageUrlInput || !editingIdInput) {
        showToast('입력값을 확인해주세요.');
        return;
    }

    const title = titleInput.value.trim();
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const hourValue = hourInput.value.trim();
    const minValue = minInput.value.trim();
    const type = typeInput.value || '개인방송';
    const members = membersInput.value.trim();
    const imageUrl = imageUrlInput.value.trim();
    const editingEventId = editingIdInput.value.trim();

    if (!title) {
        showToast('일정 제목을 입력해주세요.');
        titleInput.focus();
        return;
    }

    if (!startDate || !endDate) {
        showToast('시작/종료 날짜를 모두 입력해주세요.');
        return;
    }

    if (new Date(endDate) < new Date(startDate)) {
        showToast('종료 날짜는 시작 날짜 이후여야 합니다.');
        return;
    }

    let time = '';
    if (hourValue || minValue) {
        const hour = parseInt(hourValue, 10);
        const min = minValue ? parseInt(minValue, 10) : 0;

        if (!hourValue || Number.isNaN(hour) || hour < 1 || hour > 12) {
            showToast('올바른 시간을 입력해주세요.');
            hourInput.focus();
            return;
        }
        if (minValue && (Number.isNaN(min) || min < 0 || min > 59)) {
            showToast('올바른 분을 입력해주세요.');
            minInput.focus();
            return;
        }

        let mergedHour = hour % 12;
        if (currentAMPM === '오후') mergedHour += 12;
        time = `${String(mergedHour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    const eventData = {
        title,
        type,
        members,
        imageUrl,
        startDate,
        endDate,
        dateId: startDate,
        time,
        updatedAt: new Date().getTime()
    };

    const saveButton = document.querySelector('#eventModal button[onclick="saveEvent()"]');
    if (saveButton) { saveButton.textContent = '저장 중...'; saveButton.disabled = true; }

    try {
        if (editingEventId) {
            await setDoc(doc(db, 'events', editingEventId), eventData);
        } else {
            await addDoc(collection(db, 'events'), eventData);
        }

        await updateDbStatus();
        loadedMonths.clear();
        events = {};
        await ensureMonthsLoadedForDate(new Date(startDate));
        renderCalendar();
        closeModal('eventModal');
        showToast('일정이 저장되었습니다.');
    } catch (error) {
        console.error('일정 저장 오류:', error);
        showToast('일정 저장 중 오류가 발생했습니다.');
    } finally {
        if (saveButton) { saveButton.textContent = '저장'; saveButton.disabled = false; }
    }
}

async function deleteEvent() {
    if (!isAdmin) return;
    const editingIdInput = document.getElementById('editingEventDocId');
    if (!editingIdInput) return;

    const editingEventId = editingIdInput.value.trim();
    if (!editingEventId) return;

    if (!confirm('이 일정을 삭제하시겠습니까?')) return;

    try {
        await deleteDoc(doc(db, 'events', editingEventId));
        await updateDbStatus();
        loadedMonths.clear();
        events = {};
        await ensureMonthsLoadedForDate(new Date());
        renderCalendar();
        closeModal('eventModal');
        showToast('일정이 삭제되었습니다.');
    } catch (error) {
        console.error('일정 삭제 오류:', error);
        showToast('삭제 중 오류가 발생했습니다.');
    }
}

function ensureDayManagerModal() {
    if (document.getElementById('dayManagerModal')) return;
    const html = `
    <div id="dayManagerModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; backdrop-filter:blur(2px); box-sizing:border-box; padding:10px;">
        <div class="event-modal-box mgr-modal-box" style="display:flex; flex-direction:column; padding:32px 40px; max-height:90vh; width:100%; max-width:850px; background:#fff; border-radius:30px; box-sizing:border-box;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-shrink:0; width:100%; gap:20px; flex-wrap:wrap;">
                <h2 id="dayManagerTitle" style="margin:0; font-family:'TMoneyDungunbaram', sans-serif; color:#7A5A2F; font-size:38px; font-weight:bold; text-align:left; letter-spacing:1px;">일정 관리</h2>
                <div style="display:flex; gap:10px; align-items:center; margin-left:auto;">
                    <div id="dayGlobalTimeArea" style="display:flex; gap:4px; align-items:center;">
                        <select id="dayGlobalAmpm" style="padding:6px 10px; border-radius:30px; border:1px solid #ddd; background:#fff; color:#7A5A2F; font-weight:bold; cursor:pointer; font-family:'DoolgiMayoGothic', sans-serif; flex-shrink:0; outline:none;">
                            <option value="오전">오전</option>
                            <option value="오후" selected>오후</option>
                        </select>                        
                        <input type="number" id="dayGlobalHour" placeholder="시" min="1" max="12" class="event-custom-input" style="width:60px; padding:6px; text-align:center;">
                        <span style="font-weight:bold; color:#7A5A2F;">:</span>
                        <input type="number" id="dayGlobalMin" placeholder="분" min="0" max="59" class="event-custom-input" style="width:60px; padding:6px; text-align:center;">
                    </div>
                    <div style="display:flex; background:#f1f5f9; border-radius:30px; padding:4px; flex-shrink:0;">
                        <button id="dayGlobalBangon" onclick="setDayGlobalType('뱅온')" style="padding:6px 16px; border-radius:30px; border:none; background:#7ca349; color:white; font-weight:bold; cursor:pointer; font-family:'DoolgiMayoGothic', sans-serif;">뱅온</button>
                        <button id="dayGlobalHubang" onclick="setDayGlobalType('휴방')" style="padding:6px 16px; border-radius:30px; border:none; background:transparent; color:#64748b; font-weight:bold; cursor:pointer; font-family:'DoolgiMayoGothic', sans-serif;">휴방</button>
                    </div>
                </div>
            </div>
            
            <div id="dayManagerList" style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:16px; padding-right:8px; min-height:300px;"></div>

            <div class="mgr-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:20px; border-top:1px solid #f1f5f9; flex-shrink:0;">
                <div class="mgr-footer-left" style="display:flex; gap:10px;">
                <button onclick="deleteAllDayManagerItems()" style="padding:12px 24px; background:#fee2e2; color:#ef4444; border:none; border-radius:30px; cursor:pointer; font-weight:800; font-family:'DoolgiMayoGothic', sans-serif;">일괄 삭제</button>
                <button onclick="addDayManagerItem()" style="padding:12px 24px; background:#e0f2fe; color:#0284c7; border:none; border-radius:30px; cursor:pointer; font-weight:800; font-family:'DoolgiMayoGothic', sans-serif;">+ 새 일정</button>
                </div>
                <div class="mgr-footer-right" style="display:flex; gap:8px; align-items:center;">
                    <button onclick="closeModal('dayManagerModal')" style="padding:12px 24px; background:#f1f5f9; color:#64748b; border:none; border-radius:30px; cursor:pointer; font-weight:800;">닫기</button>
                    <button onclick="saveDayManager()" style="padding:12px 24px; background:#7ca349; color:#ffffff; border:none; border-radius:30px; cursor:pointer; font-weight:800;">저장</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

window.currentDayGlobalType = '뱅온';
window.setDayGlobalType = function(type) {
    window.currentDayGlobalType = type;
    const bangonBtn = document.getElementById('dayGlobalBangon');
    const hubangBtn = document.getElementById('dayGlobalHubang');
    const timeArea = document.getElementById('dayGlobalTimeArea');
    
    if (type === '뱅온') {
        bangonBtn.style.background = '#7ca349';
        bangonBtn.style.color = 'white';
        hubangBtn.style.background = 'transparent';
        hubangBtn.style.color = '#64748b';
        timeArea.style.display = 'flex';
    } else {
        hubangBtn.style.background = '#7ca349';
        hubangBtn.style.color = 'white';
        bangonBtn.style.background = 'transparent';
        bangonBtn.style.color = '#64748b';
        timeArea.style.display = 'none';
    }
};

window.openDayManager = function(dateIdStr, targetEventId = null) {
    if (!isAdmin) return;
    ensureDayManagerModal();
    dayManagerActiveDateId = dateIdStr;

    document.getElementById('dayManagerModal').style.display = 'flex';
    
    const parts = dateIdStr.split('-');
    const titleStr = `${parts[0]}년 ${parts[1]}월 ${parts[2]}일 관리`;
    document.getElementById('dayManagerTitle').innerText = titleStr;
    
    const targetDate = new Date(parts[0], parseInt(parts[1])-1, parts[2]);
    targetDate.setHours(0,0,0,0);
    
    const allEventsRaw = [];
    const seenIds = new Set();
    Object.values(events).flat().forEach(ev => {
        if (!seenIds.has(ev.id)) { seenIds.add(ev.id); allEventsRaw.push(ev); }
    });
    
    const dayEvents = allEventsRaw.filter(ev => {
        const start = new Date(ev.startDate || ev.dateId);
        const end = new Date(ev.endDate || ev.dateId);
        start.setHours(0,0,0,0); end.setHours(0,0,0,0);
        return targetDate >= start && targetDate <= end;
    });

    window.currentDummyGlobalIds = [];
    let foundGlobalType = '뱅온';
    let foundGlobalTime = '';
    dayEvents.forEach(ev => {
        if (ev.isDummyGlobal) window.currentDummyGlobalIds.push(ev.id);
        if (ev.dayGlobalType) foundGlobalType = ev.dayGlobalType;
        if (ev.dayGlobalTime) foundGlobalTime = ev.dayGlobalTime;
    });
    
    if (foundGlobalTime) {
        const [gh, gm] = foundGlobalTime.split(':');
        let h24 = parseInt(gh, 10);
        let ampm = h24 >= 12 ? '오후' : '오전';
        let h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        document.getElementById('dayGlobalHour').value = h12 || '';
        document.getElementById('dayGlobalMin').value = gm || '';
        if (document.getElementById('dayGlobalAmpm')) document.getElementById('dayGlobalAmpm').value = ampm;
    } else {
        document.getElementById('dayGlobalHour').value = '';
        document.getElementById('dayGlobalMin').value = '';
        if (document.getElementById('dayGlobalAmpm')) document.getElementById('dayGlobalAmpm').value = '오후';
    }
    setDayGlobalType(foundGlobalType);
    
    dayManagerItems = dayEvents.filter(ev => !ev.isDummyGlobal).map((ev, idx) => {
        const timeData = parseTimeStr(ev.time);
        return {
            ...ev,
            ampm: timeData.ampm,
            hour: timeData.hour,
            min: timeData.min,
            isExpanded: targetEventId === ev.id || (targetEventId === null && idx === 0),
            isDeleted: false,
            originalId: ev.id
        };
    });
    
    dayManagerItems.sort((a, b) => {
        const startA = new Date(a.startDate || a.dateId).getTime();
        const startB = new Date(b.startDate || b.dateId).getTime();
        if (startA !== startB) return startA - startB;
        return (a.order ?? 9999) - (b.order ?? 9999);
    });
    
    dayManagerFormattedDateId = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;

    renderDayManagerList();
    document.getElementById('dayManagerModal').style.display = 'flex';
}

window.renderDayManagerList = function() {
    const list = document.getElementById('dayManagerList');
    list.innerHTML = '';
    
    const style = document.createElement('style');
    style.innerHTML = `
        .event-custom-input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ddd; border-radius: 30px; color: #7A5A2F; font-weight: bold; }
        .mgr-ampm-btn { padding: 8px 12px; border: 1px solid #ddd; background: #fff; cursor: pointer; border-radius: 30px; font-weight: bold; color: #7A5A2F; flex-shrink: 0; }
        .mgr-ampm-btn.active { background: #7ca349; border-color: #7ca349; color: #ffffff; }
        .mgr-time-row { display: flex; gap: 6px; align-items: center; }
        .mgr-date-row { display: flex; gap: 10px; }

        .mgr-modal-box { overflow: hidden !important; display: flex !important; flex-direction: column !important; }
        #dayManagerList { flex: 1 1 auto !important; min-height: 0 !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch; padding-right: 5px; }

        @media (max-width: 768px) {
            #dayManagerModal { padding: 15px 10px !important; align-items: flex-start !important; }
            .mgr-modal-box { padding: 20px 15px !important; width: 100% !important; max-height: calc(100vh - 30px) !important; box-sizing: border-box; }
            
            .mgr-body { padding: 15px !important; display: flex !important; flex-direction: column !important; gap: 15px !important; }
            .mgr-col { width: 100% !important; min-width: 0 !important; margin-bottom: 0 !important; box-sizing: border-box; display: flex !important; flex-direction: column !important; gap: 12px !important; }
            .mgr-divider { display: none !important; }
            
            .mgr-time-row { flex-wrap: wrap; gap: 8px; }
            .mgr-date-row { flex-direction: column; gap: 12px; }

            .mgr-footer { flex-shrink: 0 !important; flex-direction: column; gap: 12px; align-items: stretch !important; height: auto !important; margin-top: 10px !important; padding-top: 15px !important; }
            .mgr-footer-left { justify-content: space-between; width: 100%; box-sizing: border-box; }
            .mgr-footer-right { flex-wrap: wrap; justify-content: space-between; width: 100%; gap: 6px; box-sizing: border-box; }
            .mgr-footer-left button { flex: 1; padding: 12px 5px !important; font-size: 13px !important; margin: 0 4px; }
            .mgr-footer-right input { width: 100% !important; margin-bottom: 8px; order: -1; box-sizing: border-box; }
            .mgr-footer-right button { flex: 1; padding: 12px 5px !important; font-size: 13px !important; white-space: nowrap; margin: 0; }
        }
    `;
    if (!document.getElementById('mgr-style')) { style.id = 'mgr-style'; document.head.appendChild(style); }

    dayManagerItems.forEach((item, idx) => {
        if (item.isDeleted) return;
        
        const card = document.createElement('div');
        card.style.cssText = 'background:#ffffff; border:1px solid #e2e8f0; border-radius:30px; overflow:hidden; transition:all 0.2s; flex-shrink: 0;';
        
        if (item.isExpanded) {
            card.style.borderColor = '#e2e8f0'; 
            card.style.boxShadow = 'none'; 
        }
        
        const header = document.createElement('div');
        header.style.cssText = `display:flex; align-items:center; padding:16px; cursor:pointer; gap:12px; ${item.isExpanded ? 'background:#fafaf9; border-bottom:1px solid #e2e8f0;' : 'background:#ffffff;'}`;
        header.onclick = () => { 
            saveTempValues(card, idx);
            item.isExpanded = !item.isExpanded; 
            renderDayManagerList(); 
        };
        
        const orderDiv = document.createElement('div');
        orderDiv.style.cssText = 'display:flex; flex-direction:column; gap:4px; align-items:center;';
        orderDiv.innerHTML = `<button onclick="event.stopPropagation(); moveDayManagerItem(${idx}, -1)" style="border:none; background:none; cursor:pointer; padding:2px; line-height:1; font-size:12px; color:#94a3b8; ${idx === 0 ? 'opacity:0.3; pointer-events:none;' : ''}">▲</button><button onclick="event.stopPropagation(); moveDayManagerItem(${idx}, 1)" style="border:none; background:none; cursor:pointer; padding:2px; line-height:1; font-size:12px; color:#94a3b8; ${idx === dayManagerItems.length - 1 ? 'opacity:0.3; pointer-events:none;' : ''}">▼</button>`;
        
        const titleSpan = document.createElement('div');
        titleSpan.style.cssText = 'flex:1; font-weight:800; font-size:16px; color:#7A5A2F; overflow:hidden; text-overflow:ellipsis; font-family:"TMoneyDungunbaram", sans-serif;';
        titleSpan.innerText = item.title || '(새 일정)';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerText = '✕';
        deleteBtn.style.cssText = 'background:none; color:#7A5A2F; border:none; padding:4px 8px; font-weight:900; font-size:18px; cursor:pointer;';
        deleteBtn.onclick = (e) => { e.stopPropagation(); if(confirm('이 일정을 지우시겠습니까?')) removeDayManagerItem(idx); };
        
        header.appendChild(orderDiv); header.appendChild(titleSpan); header.appendChild(deleteBtn);
        card.appendChild(header);
        
        if (item.isExpanded) {
            const body = document.createElement('div');
            body.className = 'mgr-body';
            body.style.cssText = 'padding:24px; display:flex; gap:20px; flex-wrap:wrap; background:#ffffff;';
            
            const types = ['개인방송', '합방', '휴방', '미확정', '시네티'];
            let typeOpts = types.map(t => `<option value="${t}" ${item.type === t ? 'selected' : ''}>${t}</option>`).join('');
            
            body.innerHTML = `
                <div class="mgr-col" style="flex:1; min-width:300px; display:flex; flex-direction:column; gap:12px;">
                    <div><label style="display:block; font-weight:800; color:#7A5A2F; font-size:14px; margin-bottom:4px;">일정 제목 *</label><textarea class="event-custom-input mgr-title" style="resize: vertical; min-height: 42px; font-family: inherit;">${item.title || ''}</textarea></div>                    <div>
                        <label style="display:block; font-weight:800; color:#7A5A2F; font-size:14px; margin-bottom:4px;">시간</label>
                        <div class="mgr-time-row">
                            <button class="mgr-ampm-btn ${item.ampm === '오전' ? 'active' : ''}" onclick="setMgrAmPm(this, '오전')">오전</button>
                            <button class="mgr-ampm-btn ${item.ampm === '오후' ? 'active' : ''}" onclick="setMgrAmPm(this, '오후')">오후</button>
                            <input type="number" class="event-custom-input mgr-hour" value="${item.hour || ''}" placeholder="시" style="width:70px; min-width:60px; flex:1;">
                            <input type="number" class="event-custom-input mgr-min" value="${item.min || ''}" placeholder="분" style="width:70px; min-width:60px; flex:1;">
                        </div>
                    </div>
                    <div class="mgr-date-row">
                        <div style="flex:1;"><label style="display:block; font-weight:800; color:#7A5A2F; font-size:14px; margin-bottom:4px;">시작</label><input type="date" class="event-custom-input mgr-start" value="${item.startDate || dayManagerFormattedDateId}"></div>
                        <div style="flex:1;"><label style="display:block; font-weight:800; color:#7A5A2F; font-size:14px; margin-bottom:4px;">종료</label><input type="date" class="event-custom-input mgr-end" value="${item.endDate || dayManagerFormattedDateId}"></div>
                    </div>
                    <div><label style="display:block; font-weight:800; color:#7A5A2F; font-size:14px; margin-bottom:4px;">유형</label><select class="event-custom-input mgr-type" style="cursor:pointer; font-weight:bold; width:100%;">${typeOpts}</select></div>
                </div>
                <div class="mgr-divider" style="border-left: 1px solid #e2e8f0; margin: 0 10px;"></div>
                <div class="mgr-col" style="flex:1; min-width:300px; display:flex; flex-direction:column; gap:12px;">
                    <div><label style="display:block; font-weight:800; color:#7A5A2F; font-size:14px; margin-bottom:4px;">참여 멤버 (쉼표로 구분)</label><input type="text" class="event-custom-input mgr-members" value="${item.members || ''}" placeholder="예시) 마냥,멤버2,멤버3"></div>
                    <div>
                        <label style="display:block; font-weight:800; color:#7A5A2F; font-size:14px; margin-bottom:4px;">이미지 URL</label>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="dayMgrImg_${idx}" class="event-custom-input mgr-image" value="${item.imageUrl || ''}">
                            <label style="background:#e2e8f0; color:#475569; padding:0 14px; border-radius:30px; cursor:pointer; font-weight:bold; font-size:13px; display:flex; align-items:center; white-space:nowrap; flex-shrink:0;">
                                첨부<input type="file" accept="image/*" style="display:none;" onchange="uploadDayManagerImg(this, ${idx})">
                            </label>
                        </div>
                    </div>
                </div>
            `;
            card.appendChild(body);
        }
        list.appendChild(card);
    });
}

function saveTempValues(card, idx) {
    const item = dayManagerItems[idx];
    if (!card.querySelector('.mgr-title')) return;
    item.title = card.querySelector('.mgr-title').value;
    
    const activeBtn = card.querySelector('.mgr-ampm-btn.active');
    item.ampm = activeBtn ? activeBtn.innerText : '오전';
    
    item.hour = card.querySelector('.mgr-hour').value;
    item.min = card.querySelector('.mgr-min').value;
    item.startDate = card.querySelector('.mgr-start').value;
    item.endDate = card.querySelector('.mgr-end').value;
    item.type = card.querySelector('.mgr-type').value;
    item.members = card.querySelector('.mgr-members').value;
    item.imageUrl = card.querySelector('.mgr-image').value;
}

window.moveDayManagerItem = function(idx, dir) {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= dayManagerItems.length) return;
    const temp = dayManagerItems[idx];
    dayManagerItems[idx] = dayManagerItems[targetIdx];
    dayManagerItems[targetIdx] = temp;
    renderDayManagerList();
}

window.removeDayManagerItem = function(idx) {
    dayManagerItems[idx].isDeleted = true;
    renderDayManagerList();
}

window.addDayManagerItem = function() {
    const cards = document.querySelectorAll('#dayManagerList > div');
    cards.forEach((card, idx) => saveTempValues(card, idx));

    dayManagerItems.forEach(i => i.isExpanded = false);
    dayManagerItems.push({
        id: null, title: '', time: '', type: '개인방송',
        ampm: '오전', hour: '', min: '',
        startDate: dayManagerFormattedDateId, endDate: dayManagerFormattedDateId,
        members: '', noticeLink: '', imageUrl: '',
        isExpanded: true, isDeleted: false
    });
    renderDayManagerList();
    setTimeout(() => {
        const list = document.getElementById('dayManagerList');
        if (list) list.scrollTop = list.scrollHeight;
    }, 50);
}

window.uploadDayManagerImg = async function(input, idx) {
    if (input.files && input.files[0]) {
        try {
            showToast('이미지 업로드 중...');
            const formData = new FormData();
            formData.append("file", input.files[0]);
            formData.append("upload_preset", "IMG_1234");
            const res = await fetch(`https://api.cloudinary.com/v1_1/dtlqzklk5/image/upload`, { method: "POST", body: formData });
            const data = await res.json();
            if (data.secure_url) {
                dayManagerItems[idx].imageUrl = data.secure_url;
                document.getElementById(`dayMgrImg_${idx}`).value = data.secure_url;
                showToast('업로드 완료');
            }
        } catch(e) { showToast('업로드 실패'); }
    }
}

window.saveDayManager = async function() {
    if (!isAdmin) return;

    const cards = document.querySelectorAll('#dayManagerList > div');
    cards.forEach((card, idx) => { saveTempValues(card, idx); });

    const btn = document.querySelector('#dayManagerModal button[onclick="saveDayManager()"]');
    if (btn) { btn.innerText = '저장 중...'; btn.disabled = true; }
    
    let gHour = document.getElementById('dayGlobalHour').value.trim();
    let gMin = document.getElementById('dayGlobalMin').value.trim();
    let gAmpm = document.getElementById('dayGlobalAmpm') ? document.getElementById('dayGlobalAmpm').value : '오후';
    let globalTimeStr = '';
    if (window.currentDayGlobalType === '뱅온' && (gHour || gMin)) {
        let h = parseInt(gHour) || 0;
        if (gAmpm === '오후' && h < 12) h += 12;
        if (gAmpm === '오전' && h === 12) h = 0;
        globalTimeStr = `${String(h).padStart(2, '0')}:${(gMin || '0').padStart(2, '0')}`;
    }

    try {
        const promises = [];
        let orderCounter = 0;
        
        window.currentDummyGlobalIds.forEach(id => {
            promises.push(deleteDoc(doc(db, 'events', id)));
        });
        
        for (let i = 0; i < dayManagerItems.length; i++) {
            const item = dayManagerItems[i];
            const isTitleEmpty = !item.title || item.title.trim() === '';
            if (item.isDeleted || isTitleEmpty) {
                if (item.originalId) promises.push(deleteDoc(doc(db, 'events', item.originalId)));
            } else {
                let timeStr = '';
                if (item.hour || item.min) {
                    let h = parseInt(item.hour) || 0;
                    if (item.ampm === '오후' && h < 12) h += 12;
                    if (item.ampm === '오전' && h === 12) h = 0;
                    timeStr = `${String(h).padStart(2, '0')}:${String(item.min || 0).padStart(2, '0')}`;
                }

                const data = {
                    title: item.title.trim(), time: timeStr, type: item.type || '개인방송',
                    members: item.members || '', imageUrl: item.imageUrl || '',
                    startDate: item.startDate || dayManagerFormattedDateId, endDate: item.endDate || dayManagerFormattedDateId,
                    dateId: item.startDate || dayManagerFormattedDateId, order: orderCounter++,
                    dayGlobalType: window.currentDayGlobalType, dayGlobalTime: globalTimeStr
                };
                
                if (item.originalId) { promises.push(setDoc(doc(db, 'events', item.originalId), data)); }
                else {
                    const customDocId = `${data.startDate}_${data.title.replace(/\//g, '-')}_${new Date().getTime()}`;
                    promises.push(setDoc(doc(db, 'events', customDocId), data));
                }
            }
        }
        
        const validItems = dayManagerItems.filter(item => !item.isDeleted && item.title && item.title.trim() !== '');
        if (validItems.length === 0) {
            let fallbackTitle = window.currentDayGlobalType === '휴방' ? '휴방' : '일정미정';
            let fallbackType = window.currentDayGlobalType === '휴방' ? '휴방' : '미확정';
            
            const dummyData = {
                title: fallbackTitle, type: fallbackType, isDummyGlobal: true, time: globalTimeStr,
                dayGlobalType: window.currentDayGlobalType, dayGlobalTime: globalTimeStr,
                startDate: dayManagerFormattedDateId, endDate: dayManagerFormattedDateId,
                dateId: dayManagerFormattedDateId, order: -1
            };
            const customDocId = `${dayManagerFormattedDateId}_global_${new Date().getTime()}`;
            promises.push(setDoc(doc(db, 'events', customDocId), dummyData));
        }
        
        await Promise.all(promises);
        await updateDbStatus();
        loadedMonths.clear(); events = {};
        await ensureMonthsLoadedForDate(currentDate);
        renderCalendar();
        closeModal('dayManagerModal');
        showToast('일정이 저장되었습니다.');
    } catch (error) { showToast('저장 중 오류가 발생했습니다.'); } finally { if (btn) { btn.innerText = '저장'; btn.disabled = false; } }
}

window.deleteAllDayManagerItems = async function() {
    if (!isAdmin) return;
    const hasVisibleItems = dayManagerItems.some(item => !item.isDeleted);
    if (!hasVisibleItems) { showToast('삭제할 일정이 없습니다.'); return; }
    if (!confirm('이 날짜의 모든 일정과 공지사항을 일괄 삭제하시겠습니까?')) return;

    dayManagerItems.forEach(item => { item.isDeleted = true; });

    document.getElementById('dayGlobalHour').value = '';
    document.getElementById('dayGlobalMin').value = '';
    if (document.getElementById('dayGlobalAmpm')) document.getElementById('dayGlobalAmpm').innerText = '오후';
    if (document.getElementById('dayGlobalAmpm')) document.getElementById('dayGlobalAmpm').value = '오후';
    setDayGlobalType('뱅온');

    renderDayManagerList();
    await window.saveDayManager();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if(!grid) return;
    grid.innerHTML = '';
    const isMobile = window.innerWidth < 1050;
    
    const allEventsRaw = [];
    const seenIds = new Set();
    Object.values(events).flat().forEach(ev => {
        if (!seenIds.has(ev.id)) { seenIds.add(ev.id); allEventsRaw.push(ev); }
    });

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
            dayDate.setHours(0,0,0,0); 

            const num = dayDate.getDate(); const m = dayDate.getMonth() + 1; const y = dayDate.getFullYear();
            const dateId = `${y}-${m}-${num}`;
            
            const row = document.createElement('div'); row.className = 'week-row'; row.dataset.dateId = dateId;
            const isToday = dayDate.getDate() === new Date().getDate() && dayDate.getMonth() === new Date().getMonth() && dayDate.getFullYear() === new Date().getFullYear();
            if (isToday) row.classList.add('today-row');
            
            if (isAdmin) row.oncontextmenu = (e) => { e.preventDefault(); openDayManager(dateId); };

            row.onclick = (e) => {
                showDayInfo(dateId, todaysEvents);
            };
            
            const dayLabel = document.createElement('div'); dayLabel.className = 'week-day-label';
            const dayName = document.createElement('div'); dayName.className = `week-day-name ${yoilColors[i] || ''}`; dayName.innerText = yoils[i];
            const dayNumber = document.createElement('div'); dayNumber.className = `week-day-num`; dayNumber.innerText = num;
            dayLabel.appendChild(dayName); dayLabel.appendChild(dayNumber);

            const todaysEvents = allEventsRaw.filter(ev => {
                const start = new Date(ev.startDate || ev.dateId); 
                const end = new Date(ev.endDate || ev.dateId);
                start.setHours(0, 0, 0, 0); 
                end.setHours(0, 0, 0, 0);
                return dayDate >= start && dayDate <= end;
            });

            todaysEvents.sort((a, b) => {
                const startA = new Date(a.startDate || a.dateId).getTime(); 
                const startB = new Date(b.startDate || b.dateId).getTime();
                if (startA !== startB) return startA - startB;
                return (a.order ?? 9999) - (b.order ?? 9999);
            });

            let dayGlobalTime = '';
            let dayGlobalType = '';
            todaysEvents.forEach(ev => {
                if (ev.dayGlobalType) dayGlobalType = ev.dayGlobalType;
                if (ev.dayGlobalTime) dayGlobalTime = ev.dayGlobalTime;
            });

            const eventsDiv = document.createElement('div'); eventsDiv.className = 'week-events';
            const displayEvents = todaysEvents;
            if (displayEvents.length > 0) {
                        displayEvents.forEach((ev, idx) => {
                            const isLong = ev.startDate && ev.endDate && (new Date(ev.endDate) > new Date(ev.startDate));
                            const typeClass = (ev.type || '개인방송').replace(/\s+/g, '');
                            const item = document.createElement('div');
                            item.className = `event-tag type-${typeClass}${isLong ? ' long-term' : ''}`;
                            
                            item.onclick = (e) => { e.stopPropagation(); showDayInfo(dateId, todaysEvents); };
                            if (isAdmin) item.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); openDayManager(dateId, ev.id); };
                            
                            if (ev.time) { item.innerHTML = `<span class="event-time-badge">${formatTime12h(ev.time)}</span><div>${ev.title}</div>`; } 
                            else { item.innerHTML = `<div>${ev.title}</div>`; }
                            eventsDiv.appendChild(item);
                        });
                    } else { 
                        eventsDiv.innerHTML = "<div class='empty-event-card'>오늘은 일정이 없습니다.</div>"; 
                    }
            row.appendChild(dayLabel); row.appendChild(eventsDiv); grid.appendChild(row);
            
            if (dayGlobalType === '뱅온' && dayGlobalTime) {
                dayLabel.insertAdjacentHTML('beforeend', `<div style="font-size:11px; color:inherit; font-weight:900; margin-top:4px;">${formatTime12h(dayGlobalTime)}</div>`);
            }
        }
        } else { 
        grid.className = 'calendar-grid';
        grid.className = 'calendar-grid';
        grid.innerHTML = `<div class="day-label">월</div><div class="day-label">화</div><div class="day-label">수</div><div class="day-label">목</div><div class="day-label">금</div><div class="day-label text-blue-400">토</div><div class="day-label text-red-400">일</div>`;
        
        const y = currentDate.getFullYear(); const m = currentDate.getMonth();
        const monthDisplay = document.getElementById('monthDisplay');
        if (monthDisplay) monthDisplay.innerText = `${m + 1}월`;
        
        const firstDay = new Date(y, m, 1); const lastDay = new Date(y, m + 1, 0);
        const startIdx = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        
        for (let i = startIdx; i > 0; i--) { const tempD = new Date(y, m, 1 - i); createDay(tempD.getDate(), false, [], tempD); }
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const d = new Date(y, m, i);
            const todaysEvents = allEventsRaw.filter(ev => {
                const start = new Date(ev.startDate || ev.dateId); const end = new Date(ev.endDate || ev.dateId);
                start.setHours(0,0,0,0); end.setHours(0,0,0,0);
                return d >= start && d <= end;
            });
            todaysEvents.sort((a, b) => {
                const startA = new Date(a.startDate || a.dateId).getTime(); const startB = new Date(b.startDate || b.dateId).getTime();
                if (startA !== startB) return startA - startB;
                return (a.order ?? 9999) - (b.order ?? 9999);
            });
            createDay(i, true, todaysEvents, d); 
        }
        const totalDays = startIdx + lastDay.getDate();
        const nextDays = (7 - (totalDays % 7)) % 7;
        for (let i = 1; i <= nextDays; i++) {
            const tempD = new Date(y, m + 1, i);
            createDay(tempD.getDate(), false, [], tempD);
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

function createDay(num, isCurr, dayEvents = [], dayDate) {
    let dayGlobalTime = '';
    let dayGlobalType = '';
    dayEvents.forEach(ev => {
        if (ev.dayGlobalType) dayGlobalType = ev.dayGlobalType;
        if (ev.dayGlobalTime) dayGlobalTime = ev.dayGlobalTime;
    });

    const dateId = `${dayDate.getFullYear()}-${dayDate.getMonth() + 1}-${num}`;
    const div = document.createElement('div'); div.dataset.dateId = dateId; div.className = 'day' + (isCurr ? '' : ' not-current');
    const numDiv = document.createElement('div'); numDiv.className = 'day-num';
    const today = new Date();
    const isToday = isCurr && today.getDate() === dayDate.getDate() && today.getMonth() === dayDate.getMonth() && today.getFullYear() === dayDate.getFullYear();
    
    let globalUI = '';
    if (isCurr) {
        if (dayGlobalType === '뱅온' && dayGlobalTime) {
            globalUI = `<span style="margin-left:auto; font-size:13px; color:inherit; font-weight:900;">${formatTime12h(dayGlobalTime)}</span>`;
        }
    }
    numDiv.innerHTML = (isCurr ? (isToday ? `<span class="today-circle">${num}</span>` : num) : '') + globalUI;
    div.appendChild(numDiv);
    const evCont = document.createElement('div'); evCont.className = 'event-container';
    const displayEvents = dayEvents;
    if (isCurr && displayEvents.length > 0) {
        displayEvents.forEach((ev, idx) => {
            const isLong = ev.startDate && ev.endDate && (new Date(ev.endDate) > new Date(ev.startDate));
            const tag = document.createElement('div');
            tag.className = `event-tag type-${ev.type}${isLong ? ' long-term' : ''}`; tag.dataset.id = ev.id;
            tag.style.position = 'relative';

            // 텍스트 강제 가운데 정렬(text-align: center)
            tag.innerHTML = `${ev.time ? `<span class="event-time-badge" style="position: absolute; top: 3px; right: 6px; left: auto; margin: 0; font-size: 10px; line-height: 1;">${formatTime12h(ev.time)}</span>` : ''}<div style="flex: 1; text-align: center; width: 100%; line-height: 1.3; word-break: break-word;">${ev.title}</div>`;
            evCont.appendChild(tag);
        });
    }
    div.appendChild(evCont);
    
    if (isCurr && isAdmin) div.oncontextmenu = (e) => { e.preventDefault(); openDayManager(dateId); };

    if (isCurr) {
        div.onclick = (e) => {
            showDayInfo(dateId, dayEvents);
        };
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
    
    const timeTypeStr = dateText + (ev.type ? ` | ${ev.type}` : '');
    const timeEl = document.getElementById('infoTime'); 
    
    if (timeEl) {
        timeEl.className = '';
        timeEl.style.cssText = 'text-align:center; margin-bottom: 24px;';
        const typeClass = ev.type ? `type-${ev.type.replace(/\s+/g, '')}` : '';
        timeEl.innerHTML = `<span class="${typeClass}" style="display:inline-block; padding: 6px 16px; border-radius: 20px; font-weight: 800; font-size: 14px;">${timeTypeStr}</span>`;
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

    const modal = document.getElementById('infoModal'); if(modal) modal.style.display = 'flex';
}

function updateSummary() {
    const cont = document.getElementById('summaryContent'); 
    if(!cont) return;
    cont.innerHTML = '';

    const todayLocal = new Date();
    todayLocal.setHours(0, 0, 0, 0);

    const allEventsRaw = [];
    const seenIds = new Set();
    Object.values(events).flat().forEach(ev => {
        if (!seenIds.has(ev.id)) { seenIds.add(ev.id); allEventsRaw.push(ev); }
    });

    const todaysEvents = allEventsRaw.filter(ev => {
        const start = new Date(ev.startDate || ev.dateId); 
        const end = new Date(ev.endDate || ev.dateId);
        start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
        return todayLocal >= start && todayLocal <= end;
    });

    todaysEvents.sort((a, b) => {
        const startA = new Date(a.startDate || a.dateId).getTime(); 
        const startB = new Date(b.startDate || b.dateId).getTime();
        if (startA !== startB) return startA - startB;
        return (a.order ?? 9999) - (b.order ?? 9999);
    });

    const displayEvents = todaysEvents;
    if (displayEvents.length > 0) {
        displayEvents.forEach((ev, idx) => {
            const item = document.createElement('div'); 
            const typeClass = (ev.type || '개인방송').replace(/\s+/g, '');
            
            // 기존 'summary-item' 클래스에 'type-개인방송' 등의 클래스를 함께 달아줍니다.
            item.className = `summary-item type-${typeClass}`; 
            item.onclick = () => showInfoByEvent(ev);
            
            // 기존의 동그란 점(summary-dot)을 빼고 제목과 시간만 넣습니다.
            item.innerHTML = `<span style="flex: 1; text-align: left; font-weight: 800; white-space: pre-wrap; word-break: break-word;">${ev.title}</span>${ev.time ? `<span style="font-size: 12px; font-weight: 800; opacity: 0.8; white-space: nowrap;">${formatTime12h(ev.time)}</span>` : ''}`;            
            cont.appendChild(item);
        });
    } else { 
        cont.innerHTML = "<p style='text-align: center; color: #A09586; font-weight: 800; padding: 20px 0; width: 100%;'>오늘은 일정이 없습니다.</p>"; 
    }
}

window.toggleMemo = function() {
    const memoPanel = document.getElementById('memoPanel');
    const upPanel = document.getElementById('upPanel');
    
    if (!memoPanel) return;

    if (upPanel) {
        upPanel.classList.remove('open', 'show-sheet');
    }
    
    const isOpen = memoPanel.classList.contains('open') || memoPanel.classList.contains('show-sheet');
    memoPanel.classList.remove('open', 'show-sheet');

    if (!isOpen) {
        memoPanel.classList.add('open');
        if (window.innerWidth <= 1050) {
            memoPanel.classList.add('show-sheet');
        }
        updateMemoTabUI();
        loadMemos();
    }
    updateBoardButtonsState();
};

window.toggleUpBoard = function() {
    const memoPanel = document.getElementById('memoPanel');
    const upPanel = document.getElementById('upPanel');
    
    if (!upPanel) return;

    if (memoPanel) {
        memoPanel.classList.remove('open', 'show-sheet');
    }

    const isOpen = upPanel.classList.contains('open') || upPanel.classList.contains('show-sheet');
    upPanel.classList.remove('open', 'show-sheet');

    if (!isOpen) {
        upPanel.classList.add('open');
        if (window.innerWidth <= 1050) {
            upPanel.classList.add('show-sheet');
        }
        loadUpItems();
    }
    updateBoardButtonsState();
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
        try { await deleteDoc(doc(db, "memos_list", id)); loadMemos(); showToast('메모가 삭제되었습니다.'); }
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
        document.getElementById('upTitleInput').value = ''; document.getElementById('upLinkInput').value = ''; document.getElementById('upDeadlineInput').value = '';
        loadUpItems(); showToast('UP 항목이 추가되었습니다.');
    } catch (error) { showToast('저장 실패: ' + error.message); }
};

window.loadUpItems = async function() {
    const list = document.getElementById('upList'); if(!list) return;
    try {
        const snapshot = await getDocs(collection(db, 'up'));
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<p style="text-align:center; color:#A09586; padding: 20px;">등록된 UP! 컨텐츠가 없습니다.</p>';
            return;
        }

        let items = [];
        snapshot.forEach(docSnap => { items.push({ id: docSnap.id, ...docSnap.data() }); });
        
        items.sort((a, b) => {
            if(a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
            return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
        });

        const todayLocal = new Date();
        todayLocal.setHours(0, 0, 0, 0);
        const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
        
        let renderCount = 0;

        items.forEach(data => {
            if (data.deadline && data.deadline < todayStr) return;
            
            renderCount++;
            const entry = document.createElement('div');
            entry.style.cssText = "background: #ffffff; border: 2px solid #C5D8A4; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-radius: 30px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; cursor: pointer;";
            entry.onmouseover = () => entry.style.background = "#F0F4EA"; entry.onmouseout = () => entry.style.background = "#ffffff";

            let deadlineText = '';
            if (data.deadline) {
                const parts = data.deadline.split('-');
            if (parts.length === 3) deadlineText = `<div style="color: #64748b; font-size: 11px; font-weight: 600; margin-top: 4px; font-family: 'TMoneyDungunbaram', sans-serif;">${parts[1]}.${parts[2]} 마감</div>`;
            }
            entry.innerHTML = `
                <div style="flex: 1;" onclick="window.open('${data.link}', '_blank')">
                <div style="font-weight: 800; color: #1e293b; font-size: 16px; font-family: 'TMoneyDungunbaram', sans-serif;">${data.title}</div>
                    ${deadlineText}
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <a href="${data.link}" target="_blank" style="color: #7ca349; display: flex; align-items: center;" onclick="event.stopPropagation()">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
                    </a>
                    ${isAdmin ? `<button onclick="event.stopPropagation(); deleteUpItem('${data.id}')" style="color: #aaa; font-weight: bold; cursor: pointer; border: none; background: none;">✕</button>` : ''}
                </div>
            `;
            list.appendChild(entry);
        });

        if (renderCount === 0) { list.innerHTML = '<p style="text-align:center; color:#A09586; padding: 20px; font-family:\'TMoneyDungunbaram\';">현재 진행중인 컨텐츠가 없습니다.</p>'; }
    } catch (error) { console.error("데이터 로드 중 에러 발생:", error); }
};

window.deleteUpItem = async function(id) {
    if (!isAdmin) return;
    if(confirm('이 항목을 삭제하시겠습니까?')) {
        try { await deleteDoc(doc(db, "up", id)); showToast('항목이 삭제되었습니다.'); await loadUpItems(); }
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
        
        let validItems = [];
        const todayLocal = new Date();
        const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.deadline && data.deadline < todayStr) return;
            validItems.push({ id: docSnap.id, ...data });
        });

        if (!popupImageUrl && validItems.length === 0) return;

        validItems.sort((a, b) => {
            if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
            return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
        });
        
        popupList.innerHTML = `<div style="font-family: 'TMoneyDungunbaram', sans-serif; font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 15px; color: #7ca349;">헤드번팅 꿍</div>`;
        
        if (popupImageUrl) { popupList.innerHTML += `<div style="margin-bottom: 16px;"><img src="${popupImageUrl}" style="width: 100%; height: auto; border-radius: 30px; display: block;" alt="Notice Image"></div>`; }

        validItems.forEach(data => {
            let deadlineText = '';
            if (data.deadline) {
                const parts = data.deadline.split('-');
                if (parts.length === 3) deadlineText = `<div style="color: #64748b; font-size: 12px; font-weight: 600; margin-top: 4px; font-family: 'AliceDigitalLearning', sans-serif;">${parts[1]}.${parts[2]} 마감</div>`;
            }
            
            popupList.innerHTML += `
                <div class="up-item-card" style="background: #ffffff; border: 2px solid #C5D8A4; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-radius: 30px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; cursor: pointer;" onclick="window.open('${data.link}', '_blank')" onmouseover="this.style.background='#F0F4EA'" onmouseout="this.style.background='#ffffff'">
                    <div style="flex: 1;">
                        <div style="font-weight: 800; color: #1e293b; font-size: 15px; font-family: 'AliceDigitalLearning', sans-serif;">${data.title}</div>
                        ${deadlineText}
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <a href="${data.link}" target="_blank" style="color: #7ca349; display: flex; align-items: center;" onclick="event.stopPropagation()">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
                        </a>
                    </div>
                </div>
            `;
        });

        document.getElementById('upPopupModal').style.display = 'flex';
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
        menu.style.cssText = 'position:fixed; background:white; border:2px solid #e2e8f0; border-radius:30px; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:9999; display:flex; flex-direction:column; padding:8px; gap:4px; min-width:140px;';
        
        const btnManage = document.createElement('button');
        btnManage.innerText = '업링크 관리';
        btnManage.style.cssText = 'padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; font-weight:bold; border-radius:30px; font-size:14px; font-family: "TMoneyDungunbaram";';
        btnManage.onmouseover = () => btnManage.style.background = '#f1f5f9'; btnManage.onmouseout = () => btnManage.style.background = 'none';
        btnManage.onclick = () => { menu.style.display = 'none'; window.openAdminSettings(); };
        
        const btnChangePw = document.createElement('button');
        btnChangePw.innerText = '암호 변경';
        btnChangePw.style.cssText = 'padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; font-weight:bold; border-radius:30px; font-size:14px; font-family: "TMoneyDungunbaram";';
        btnChangePw.onmouseover = () => btnChangePw.style.background = '#f1f5f9'; btnChangePw.onmouseout = () => btnChangePw.style.background = 'none';
        btnChangePw.onclick = () => { menu.style.display = 'none'; window.openPwChangeModal(); };

        const btnLogout = document.createElement('button');
        btnLogout.innerText = '로그아웃';
        btnLogout.style.cssText = 'padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; font-weight:bold; border-radius:30px; color:#ef4444; font-size:14px; font-family: "TMoneyDungunbaram";';
        btnLogout.onmouseover = () => btnLogout.style.background = '#fef2f2'; btnLogout.onmouseout = () => btnLogout.style.background = 'none';
        btnLogout.onclick = async () => { 
            menu.style.display = 'none'; 
            if (modifiedDates.size > 0) { if (confirm("순서 변경 사항이 있습니다. 저장하시겠습니까?")) await saveAllModifiedOrders(); }
            
            isAdmin = false;
            currentAdminProfile = null;
            
            // 두 저장소 모두 삭제
            sessionStorage.removeItem('sompunch_admin_session'); 
            localStorage.removeItem('sompunch_admin_session');
            
            modifiedDates.clear(); 
            updateAdminUI(); 
            renderCalendar(); 
            showToast('로그아웃 되었습니다.');
        };
        menu.appendChild(btnManage); menu.appendChild(btnChangePw); menu.appendChild(btnLogout); document.body.appendChild(menu);
    }
    
    menu.style.top = (rect.bottom + 8) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';
    
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'flex';
        setTimeout(() => {
            const closeMenu = (evt) => {
                if (!menu.contains(evt.target)) { menu.style.display = 'none'; document.removeEventListener('click', closeMenu); }
            };
            document.addEventListener('click', closeMenu);
        }, 0);
    } else { menu.style.display = 'none'; }
};

function ensureAdminSettingsModal() {
    const existing = document.getElementById('popupAdminModal');
    if (existing && existing.dataset.injected === 'true') return;
    if (existing) existing.remove();

    const html = `
    <div id="popupAdminModal" data-injected="true" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; backdrop-filter:blur(2px);">
        <div style="background:#fff; padding:32px 40px; border-radius:30px; display:flex; flex-direction:column; gap:16px; min-width:320px; max-width:420px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
            <h2 style="margin:0; font-family:'TMoneyDungunbaram', sans-serif; color:#7A5A2F; font-size:24px; text-align:center;">업링크 관리</h2>
            
            <div>
                <label style="font-weight:bold; margin-bottom:8px; display:block; color:#7A5A2F;">입장 팝업 상단 이미지</label>
                <input type="file" id="popupImgFileInput" accept="image/*" onchange="handlePopupImgUpload(this)" style="display:block; margin-bottom:10px; font-size:13px; color:#64748b; cursor:pointer; width:100%;">
                <div style="display:flex; gap:8px;">
                    <input type="text" id="popupImageUrlInput" placeholder="https://..." style="flex:1; padding:12px; border-radius:30px; border:1px solid #ddd; outline:none; font-weight:bold;">
                    <button onclick="savePopupImage()" style="padding:10px 16px; border:none; border-radius:30px; cursor:pointer; background:#7ca349; color:white; font-weight:bold; flex-shrink:0;">적용</button>
                    <button onclick="deletePopupImage()" style="padding:10px 16px; border:none; border-radius:30px; cursor:pointer; background:#ef4444; color:white; font-weight:bold; flex-shrink:0;">삭제</button>
                </div>
            </div>
            
            <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
            
            <div>
                <label style="font-weight:bold; margin-bottom:8px; display:block; color:#7A5A2F;">새 UP! 링크 추가</label>
                <input type="text" id="upTitleInput" placeholder="컨텐츠 이름" style="width:100%; padding:12px; border-radius:30px; border:1px solid #ddd; outline:none; font-weight:bold; margin-bottom:8px; box-sizing:border-box;">
                <input type="url" id="upLinkInput" placeholder="링크 주소 (https://...)" style="width:100%; padding:12px; border-radius:30px; border:1px solid #ddd; outline:none; font-weight:bold; margin-bottom:8px; box-sizing:border-box;">
                <input type="date" id="upDeadlineInput" title="마감 날짜" style="width:100%; padding:12px; border-radius:30px; border:1px solid #ddd; outline:none; font-weight:bold; margin-bottom:12px; box-sizing:border-box;">
                <button onclick="saveUpItem()" style="width:100%; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#7ca349; color:white; font-weight:bold; font-size:15px;">UP! 추가하기</button>
            </div>
            
            <button onclick="closeModal('popupAdminModal')" style="width:100%; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#f1f5f9; color:#64748b; font-weight:bold; font-size:15px; margin-top:10px;">닫기</button>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

window.openAdminSettings = async function() {
    ensureAdminSettingsModal();
    try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'popup'));
        if (settingsSnap.exists()) document.getElementById('popupImageUrlInput').value = settingsSnap.data().imageUrl || '';
        else document.getElementById('popupImageUrlInput').value = '';
    } catch(e) {}
    document.getElementById('popupAdminModal').style.setProperty('display', 'flex', 'important');
};

window.savePopupImage = async function() {
    const imgUrl = document.getElementById('popupImageUrlInput').value.trim();
    try {
        await setDoc(doc(db, 'settings', 'popup'), { imageUrl: imgUrl });
        showToast('팝업 이미지가 설정되었습니다. 새로고침 후 확인하세요.');
    } catch(e) { showToast('설정 저장 실패: ' + e.message); }
};

function ensurePwChangeModal() {
    const existing = document.getElementById('pwChangeModal');
    if (existing && existing.dataset.injected === 'true') return;
    if (existing) existing.remove();

    const html = `
    <div id="pwChangeModal" data-injected="true" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; backdrop-filter:blur(2px);">
        <div style="background:#fff; padding:32px 40px; border-radius:30px; display:flex; flex-direction:column; gap:16px; min-width:320px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
            <h2 style="margin:0; font-family:'TMoneyDungunbaram', sans-serif; color:#7A5A2F; font-size:24px; text-align:center;">암호 변경</h2>
            
            <input type="password" id="currentPwInput" placeholder="현재 비밀번호" style="padding:12px; border:1px solid #ddd; border-radius:30px; font-weight:bold; outline:none; text-align:center;">
            <input type="password" id="newPwInput" placeholder="새 비밀번호" style="padding:12px; border:1px solid #ddd; border-radius:30px; font-weight:bold; outline:none; text-align:center;">
            <input type="password" id="confirmPwInput" placeholder="새 비밀번호 확인" style="padding:12px; border:1px solid #ddd; border-radius:30px; font-weight:bold; outline:none; text-align:center;" onkeydown="if(event.key==='Enter') changeAdminPassword()">
            
            <div id="pwChangeError" class="hidden" style="color:#ef4444; font-size:13px; text-align:center; font-weight:bold;"></div>
            
            <div style="display:flex; gap:10px; margin-top:10px;">
                <button onclick="closeModal('pwChangeModal')" style="flex:1; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#f1f5f9; color:#64748b; font-weight:bold; font-size:15px;">취소</button>
                <button onclick="changeAdminPassword()" class="btn-save" style="flex:1; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#7ca349; color:white; font-weight:bold; font-size:15px;">변경</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

window.openPwChangeModal = function() {
    ensurePwChangeModal();
    document.getElementById('currentPwInput').value = '';
    document.getElementById('newPwInput').value = '';
    document.getElementById('confirmPwInput').value = '';
    const err = document.getElementById('pwChangeError');
    if (err) err.classList.add('hidden');
    document.getElementById('pwChangeModal').style.setProperty('display', 'flex', 'important');
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
        
        let profiles = getAdminProfiles();
        profiles = profiles.filter(p => p.id !== currentAdminProfile.id);
        saveAdminProfiles(profiles);

        currentAdminProfile = null;
        sessionStorage.removeItem('sompunch_admin_session'); 
        localStorage.removeItem('sompunch_admin_session');
        
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

window.deletePopupImage = async function() {
    if (!confirm('설정된 팝업 이미지를 삭제하시겠습니까?')) return;
    try {
        await deleteDoc(doc(db, 'settings', 'popup'));
        document.getElementById('popupImageUrlInput').value = '';
        showToast('팝업 이미지가 삭제되었습니다.');
    } catch(e) { showToast('삭제 실패: ' + e.message); }
};

window.handlePopupImgUpload = async function(input) {
    if (input.files && input.files[0]) {
        try {
            showToast('팝업 이미지를 서버에 업로드 중입니다...');
            const formData = new FormData(); formData.append("file", input.files[0]); formData.append("upload_preset", "IMG_1234");
            const response = await fetch(`https://api.cloudinary.com/v1_1/dtlqzklk5/image/upload`, { method: "POST", body: formData });
            const data = await response.json();

            if (data.secure_url) {
                document.getElementById('popupImageUrlInput').value = data.secure_url;
                showToast('업로드 완료! [적용] 버튼을 눌러 저장해주세요.');
            }
        } catch (error) { showToast('이미지 업로드에 실패했습니다.'); }
    }
};

function ensureLoginModal() {
    const existing = document.getElementById('pwModal');
    
    // 이미 우리가 주입한 정상적인 모달이면 스킵
    if (existing && existing.dataset.injected === 'true') return;
    
    // HTML에 원래 있던 스타일이 망가진 구형 모달은 강제 삭제
    if (existing) existing.remove();

    const html = `
    <div id="pwModal" data-injected="true" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; backdrop-filter:blur(2px);">
        <div style="background:#fff; padding:32px 40px; border-radius:30px; display:flex; flex-direction:column; gap:16px; min-width:320px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
            <h2 style="margin:0; font-family:'TMoneyDungunbaram', sans-serif; color:#7A5A2F; font-size:24px; text-align:center;">관리자 로그인</h2>
            <input type="text" id="adminId" placeholder="아이디" style="padding:12px; border:1px solid #ddd; border-radius:30px; font-weight:bold; outline:none; text-align:center;">
            <input type="password" id="adminPw" placeholder="비밀번호" style="padding:12px; border:1px solid #ddd; border-radius:30px; font-weight:bold; outline:none; text-align:center;" onkeydown="if(event.key==='Enter') loginAdmin()">
            <label style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:14px; color:#64748b; cursor:pointer; font-weight:bold;">
                <input type="checkbox" id="stayLoggedIn"> 로그인 유지
            </label>
            <div id="pwError" class="hidden" style="color:#ef4444; font-size:13px; text-align:center; font-weight:bold;"></div>
            <div id="profileSelectionArea" style="display:none; margin-top:10px;">
                <div style="font-size:13px; color:#64748b; margin-bottom:8px; text-align:center; font-weight:bold;">저장된 프로필</div>
                <div id="adminProfileList" style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;"></div>
            </div>
            <div style="display:flex; gap:10px; margin-top:10px;">
                <button onclick="closeModal('pwModal')" style="flex:1; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#f1f5f9; color:#64748b; font-weight:bold; font-size:15px;">취소</button>
                <button onclick="loginAdmin()" style="flex:1; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#7ca349; color:white; font-weight:bold; font-size:15px;">로그인</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

window.promptAdmin = async function(e) {
    console.log("promptAdmin 함수 내부 진입 성공!"); // 이 로그가 찍히는지 확인!
    
    ensureLoginModal(); // HTML에 로그인 팝업이 없다면 자동 생성
    
    if (isAdmin) {
        window.showAdminMenu(e);
    } else {
        const adminId = document.getElementById('adminId');
        const adminPw = document.getElementById('adminPw');
        const err = document.getElementById('pwError');
        const pwModal = document.getElementById('pwModal');
        
        if (adminId) adminId.value = '';
        if (adminPw) adminPw.value = '';
        if (err) err.classList.add('hidden'); 
        
        window.renderAdminProfiles();
        if (pwModal) pwModal.style.setProperty('display', 'flex', 'important'); 
        if (adminId) adminId.focus();
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
    await Promise.all(updatePromises); 
    await updateDbStatus(); 
    modifiedDates.clear(); showToast('모든 순서가 저장되었습니다.');
}

window.moveMonth = async function(v) {
    const isMobile = window.innerWidth < 1050;
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

function ensureMonthPickerModal() {
    const existing = document.getElementById('monthPickerModal');
    if (existing && existing.dataset.injected === 'true') return;
    if (existing) existing.remove();

    const html = `
    <div id="monthPickerModal" data-injected="true" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; backdrop-filter:blur(2px);">
        <div style="background:#fff; padding:32px 40px; border-radius:30px; display:flex; flex-direction:column; gap:16px; min-width:320px; max-width:380px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <button onclick="window.changePickerYear(-1)" style="background:transparent; border:none; font-size:20px; cursor:pointer; color:#7ca349; font-weight:bold; padding: 10px;">◀</button>
                <h3 id="pickerYearDisplay" style="margin:0; font-family:'TMoneyDungunbaram', sans-serif; color:#7A5A2F; font-size:24px; text-align:center;"></h3>
                <button onclick="window.changePickerYear(1)" style="background:transparent; border:none; font-size:20px; cursor:pointer; color:#7ca349; font-weight:bold; padding: 10px;">▶</button>
            </div>
            <div class="month-picker-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;"></div>
            <div style="display:flex; justify-content:center; margin-top:10px;">
                <button onclick="closeModal('monthPickerModal')" style="width:100%; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#f1f5f9; color:#64748b; font-weight:bold; font-size:15px;">닫기</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

window.openMonthPicker = function() { 
    ensureMonthPickerModal();
    pickerYear = currentDate.getFullYear(); 
    window.updatePickerUI(); 
    document.getElementById('monthPickerModal').style.setProperty('display', 'flex', 'important'); 
};

window.updatePickerUI = function() {
    document.getElementById('pickerYearDisplay').innerText = `${pickerYear}년`;
    const grid = document.querySelector('.month-picker-grid'); grid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        const btn = document.createElement('button'); btn.className = 'month-btn'; btn.innerText = `${i + 1}월`;
        if (pickerYear === currentDate.getFullYear() && i === currentDate.getMonth()) btn.classList.add('active');
        btn.onclick = () => window.selectMonth(i); grid.appendChild(btn);
    }
};

window.changePickerYear = function(offset) { pickerYear += offset; window.updatePickerUI(); };
window.selectMonth = async function(m) { 
    currentDate.setFullYear(pickerYear); currentDate.setMonth(m); closeModal('monthPickerModal'); 
    await ensureMonthsLoadedForDate(currentDate); renderCalendar(); 
}

function updateMemoEditState() {
    const memoInput = document.getElementById('memoItemText');
    if (memoInput) memoInput.disabled = !isAdmin;
}

function updateAdminUI() {
    // 1. 관리자 모드 바디 클래스 토글
    document.body.classList.toggle('admin-mode', isAdmin);

    // 2. 관리자 전용 버튼 제어 (클래스 토글 방식)
    const adminButtons = document.querySelectorAll('.admin-only-btn');
    adminButtons.forEach(btn => {
        // isAdmin이 true이면 클래스 추가(보임), false이면 제거(숨김)
        btn.classList.toggle('is-admin-visible', isAdmin);
    });
    
    // 3. 버튼 아이콘 및 상태 업데이트
    const btnAdmin = document.getElementById('adminBtn');
    if(btnAdmin) btnAdmin.classList.toggle('admin-active', isAdmin);
    
    const btnAdminPc = document.getElementById('adminBtn_pc');
    if(btnAdminPc) btnAdminPc.classList.toggle('admin-active', isAdmin);

    // 4. 프로필 이미지 업데이트
    if (isAdmin && currentAdminProfile) {
        document.querySelectorAll('.admin-profile-img').forEach(img => {
            img.src = currentAdminProfile.img;
        });
    }

    applyDraggable(); 
    updateMemoEditState(); 
}

window.showTab = async function(tab) {
    document.querySelectorAll('.mobile-menu-item').forEach(btn => {
        if (btn.dataset.tab) btn.classList.toggle('active-mobile-tab', btn.dataset.tab === 'schedule');
    });
    document.querySelectorAll('[data-tab]').forEach(btn => {
        if (!btn.classList.contains('mobile-menu-item') && btn.dataset.tab) {
            btn.classList.toggle('active', btn.dataset.tab === 'schedule');
        }
    });

    const calendarTop = document.querySelector('.calendar-top');
    const calendarBody = document.querySelector('.calendar-body');
    const todaySchedulePanel = document.getElementById('todaySchedulePanel');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let needsDataLoad = false;
    const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
    needsDataLoad = !loadedMonths.has(monthKey);
    const isMobile = window.innerWidth < 1050;
    if (isMobile) {
        const target = new Date(currentDate);
        const dayNum = target.getDay();
        const diff = target.getDate() - dayNum + (dayNum === 0 ? -6 : 1);
        const monday = new Date(target.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        if (monday.getMonth() !== currentDate.getMonth() && !loadedMonths.has(`${monday.getFullYear()}-${monday.getMonth() + 1}`)) needsDataLoad = true;
        if (sunday.getMonth() !== currentDate.getMonth() && !loadedMonths.has(`${sunday.getFullYear()}-${sunday.getMonth() + 1}`)) needsDataLoad = true;
    }

    if (needsDataLoad && loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
    }

    if(calendarTop) calendarTop.style.display = 'flex';
    if(calendarBody) calendarBody.style.display = 'flex';
    if(todaySchedulePanel) todaySchedulePanel.style.display = 'block';
    window.location.hash = '#schedule';

    try {
        if (needsDataLoad) {
            await new Promise(resolve => setTimeout(resolve, 500)); 
        }
        await ensureMonthsLoadedForDate(currentDate);
        renderCalendar();
    } catch (error) {
        console.error('일정 탭 렌더링 중 오류 발생:', error);
    } finally {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
}

window.toggleMobileMenu = function() {
    const container = document.getElementById('mobileMenuContainer'); const iconDefault = document.getElementById('menuIconDefault'); const iconClose = document.getElementById('menuIconClose');
    if (!container) return;
    container.classList.toggle('open');
    if (iconDefault && iconClose) {
        iconDefault.style.display = container.classList.contains('open') ? 'none' : 'block';
        iconClose.style.display = container.classList.contains('open') ? 'block' : 'none';
    }
};

window.handleMobileTab = function(tab) { window.showTab(tab); window.toggleMobileMenu(); };

window.toggleMobileMemo = function() {
    const memoPanel = document.getElementById('memoPanel'); const upPanel = document.getElementById('upPanel');
    if (upPanel) upPanel.classList.remove('show-sheet');
    if (memoPanel) {
        memoPanel.classList.toggle('show-sheet');
        if (memoPanel.classList.contains('show-sheet')) { updateMemoTabUI(); loadMemos(); }
    }
    updateBoardButtonsState();
};

window.toggleMobileUpBoard = function() {
    const memoPanel = document.getElementById('memoPanel'); const upPanel = document.getElementById('upPanel');
    if (memoPanel) memoPanel.classList.remove('show-sheet');
    if (upPanel) {
        upPanel.classList.toggle('show-sheet');
        if (upPanel.classList.contains('show-sheet')) loadUpItems();
    }
    updateBoardButtonsState();
};

function ensureDayInfoModal() {
    if (document.getElementById('dayInfoModal')) return;
    const html = `
    <div id="dayInfoModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; backdrop-filter:blur(2px);">
        <div class="event-modal-box" style="display:flex; flex-direction:column; padding:32px 40px; max-height:85vh; width:fit-content; min-width:350px; max-width:95%; background:#fff; border-radius:30px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <h2 id="dayInfoTitle" style="margin-top:0; margin-bottom:24px; font-family:'TMoneyDungunbaram', sans-serif; color:#7A5A2F; font-size:34px; font-weight:bold; text-align:center; flex-shrink:0;"></h2>
            <div id="dayInfoList" style="flex:1; display:flex; flex-direction:column; gap:20px; align-items:center; overflow-x:hidden; overflow-y:auto; padding:10px 0; width: 100%;"></div>
            <div id="dayInfoNoticeArea" style="width: 100%; max-width: 600px; margin: 15px auto 0; display: none;"></div>
            <div style="display:flex; justify-content:center; margin-top:24px; flex-shrink:0;">
            <button onclick="closeModal('dayInfoModal')" style="padding:12px 32px; background:#f1f5f9; color:#64748b; border:none; border-radius: 30px; cursor:pointer; font-weight:800; font-size:15px; font-family:'TMoneyDungunbaram', sans-serif;">닫기</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

window.showDayInfo = function(dateId, dayEvents) {
    ensureDayInfoModal();
    const parts = dateId.split('-');
    document.getElementById('dayInfoTitle').innerText = `${parts[0]}년 ${parts[1]}월 ${parts[2]}일`;

    const list = document.getElementById('dayInfoList');
    list.innerHTML = '';

    list.style.justifyContent = 'flex-start';

    const displayEvents = dayEvents;
    if (!displayEvents || displayEvents.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:30px 10px; color:#A09586; font-weight:bold; font-family:'TMoneyDungunbaram', sans-serif; width:100%;">등록된 일정이 없습니다.</div>`;
    } else {
        displayEvents.forEach((ev, index) => {
            let dateText = '';
            if (ev.startDate && ev.endDate) {
                const s = new Date(ev.startDate); const e = new Date(ev.endDate);
                dateText = `${s.getFullYear().toString().slice(-2)}.${s.getMonth()+1}.${s.getDate()}${(ev.time ? ` | ${formatTime12h(ev.time)}` : '')}`;
                if (ev.startDate !== ev.endDate) dateText = `${s.getFullYear().toString().slice(-2)}.${s.getMonth()+1}.${s.getDate()} - ${e.getFullYear().toString().slice(-2)}.${e.getMonth()+1}.${e.getDate()}${(ev.time ? ` | ${formatTime12h(ev.time)}` : '')}`;
            } else if (ev.dateId) {
                const dParts = ev.dateId.split('-'); dateText = `${dParts[0].slice(-2)}.${dParts[1]}.${dParts[2]}${(ev.time ? ` | ${formatTime12h(ev.time)}` : '')}`;
            } else {
                dateText = ev.time ? formatTime12h(ev.time) : '시간 미정';
            }
            const timeTypeStr = dateText + (ev.type ? ` | ${ev.type}` : '');
            const typeClass = ev.type ? `type-${ev.type.replace(/\s+/g, '')}` : '';

            let profsHtml = '';
            if (ev.members) {
                ev.members.split(',').forEach(nameRaw => {
                    const name = nameRaw.trim(); if (!name) return;
                    const m = members[name] || { name, img: `https://placehold.co/100x100?text=${encodeURIComponent(name[0] || '')}` };
                    profsHtml += `
                        <div class="profile-card">
                            <img src="${m.img}" class="profile-img" onerror="this.src='https://placehold.co/100x100?text=?'">
                            <div class="profile-name">${m.name}</div>
                        </div>`;
                });
            }

            const cardWrapper = document.createElement('div');
            cardWrapper.style.cssText = 'width: 100%; min-width: 320px; max-width: 450px; display: flex; flex-direction: column;';
            
            cardWrapper.innerHTML = `
                <div class="info-block" style="flex:1; display:flex; flex-direction:column; margin:0;">
                        <h2 style="text-align:center; margin-top:0; margin-bottom:15px; font-size:24px; font-weight:900; word-break:keep-all; white-space:pre-wrap;">${ev.title || ''}</h2>                    <div style="text-align:center; margin-bottom: 24px;">
                        <div class="info-time ${typeClass}" style="display:inline-block; padding: 6px 16px; border-radius: 30px; font-weight: 800; font-size: 14px;">
                            ${timeTypeStr}
                        </div>
                    </div>
                    <div class="info-image-container" style="text-align:center; margin-bottom: 20px;">
                        ${ev.imageUrl ? `<img src="${ev.imageUrl}" alt="${ev.title}" class="info-image" style="max-width:100%; border-radius:30px;" onerror="this.outerHTML='<a href=&quot;${ev.imageUrl}&quot; target=&quot;_blank&quot; class=&quot;info-link&quot;>이미지 보기</a>'">` : ''}
                    </div>
                    <div class="info-profiles" style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-bottom: 20px;">
                        ${profsHtml}
                    </div>
                </div>
            `;
            
            list.appendChild(cardWrapper);

            if (index < displayEvents.length - 1) {
                const divider = document.createElement('div');
                divider.style.cssText = 'height: 2px; width: 100%; max-width: 450px; background-color: #f1f5f9; margin: 15px 0; flex-shrink: 0; border-radius: 30px;';
                list.appendChild(divider);
            }
        });
    }

    document.getElementById('dayInfoModal').style.display = 'flex';
};

window.openTextCopyModal = function() {
    let modal = document.getElementById('textCopyModal');
    
    // 팝업이 없거나 기존의 고장 난 팝업이라면 강제로 지우고 새로 완벽하게 주입합니다.
    if (!modal || modal.dataset.injected !== 'true') {
        if (modal) modal.remove();
        
        const html = `
        <div id="textCopyModal" data-injected="true" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; backdrop-filter:blur(2px);">
            <div style="background:#fff; padding:32px 40px; border-radius:30px; display:flex; flex-direction:column; gap:16px; width:90%; max-width:550px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
                <h2 style="margin:0; font-family:'TMoneyDungunbaram', sans-serif; color:#7A5A2F; font-size:24px; text-align:center;">일정 복사하기</h2>
                
                <!-- Step 1: 날짜 선택 -->
                <div id="textCopyStep1" style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block; font-weight:800; margin-bottom:6px; color:#7A5A2F;">시작 날짜</label>
                        <input type="date" id="copyStartDate" class="event-custom-input">
                    </div>
                    <div>
                        <label style="display:block; font-weight:800; margin-bottom:6px; color:#7A5A2F;">종료 날짜</label>
                        <input type="date" id="copyEndDate" class="event-custom-input">
                    </div>
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <button onclick="closeModal('textCopyModal')" style="flex:1; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#f1f5f9; color:#64748b; font-weight:bold; font-size:15px;">취소</button>
                        <button onclick="generateScheduleText()" style="flex:1; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#7ca349; color:white; font-weight:bold; font-size:15px;">확인</button>
                    </div>
                </div>

                <!-- Step 2: 미리보기 및 복사 -->
                <div id="textCopyStep2" style="display:none; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block; font-weight:800; margin-bottom:6px; color:#7A5A2F;">미리보기</label>
                        <textarea id="scheduleTextPreview" class="event-custom-input" style="min-height: 400px; resize: vertical; font-family: inherit; font-size: 14px; line-height: 1.5; background: #fafaf9;" readonly></textarea>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <button onclick="window.resetTextCopyModal()" style="flex:1; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#f1f5f9; color:#64748b; font-weight:bold; font-size:15px;">다시 선택</button>
                        <button onclick="copyScheduleText()" style="flex:1; padding:12px; border:none; border-radius:30px; cursor:pointer; background:#7ca349; color:#ffffff; font-weight:bold; font-size:15px;">복사하기</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        modal = document.getElementById('textCopyModal');
    }

    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('copyStartDate').value = `${monday.getFullYear()}-${pad(monday.getMonth()+1)}-${pad(monday.getDate())}`;
    document.getElementById('copyEndDate').value = `${sunday.getFullYear()}-${pad(sunday.getMonth()+1)}-${pad(sunday.getDate())}`;
    
    window.resetTextCopyModal();
    document.getElementById('textCopyModal').style.display = 'flex';
    modal.style.setProperty('display', 'flex', 'important');
};

window.resetTextCopyModal = function() {
    document.getElementById('textCopyStep1').style.display = 'flex';
    document.getElementById('textCopyStep2').style.display = 'none';
};

window.generateScheduleText = function() {
    const startStr = document.getElementById('copyStartDate').value;
    const endStr = document.getElementById('copyEndDate').value;
    
    if (!startStr || !endStr) return showToast('날짜를 모두 선택해주세요.');
    
    const sParts = startStr.split('-');
    const startDate = new Date(sParts[0], parseInt(sParts[1]) - 1, sParts[2]);
    const eParts = endStr.split('-');
    const endDate = new Date(eParts[0], parseInt(eParts[1]) - 1, eParts[2]);
    
    if (startDate > endDate) return showToast('종료 날짜가 시작 날짜보다 빠를 수 없습니다.');

    const allEventsRaw = [];
    const seenIds = new Set();
    Object.values(events).flat().forEach(ev => {
        if (!seenIds.has(ev.id)) { seenIds.add(ev.id); allEventsRaw.push(ev); }
    });

    const yoils = ['일', '월', '화', '수', '목', '금', '토'];
    let resultText = '';
    
    const formatTextTime = (timeStr) => {
        if (!timeStr) return '';
        const [h, m] = timeStr.split(':').map(Number);
        const ampm = h >= 12 ? '오후' : '오전';
        const h12 = h % 12 || 12;
        if (m === 0) return `${ampm} ${h12}시`;
        return `${ampm} ${h12}시 ${m}분`;
    };

    const currDate = new Date(startDate);
    while (currDate <= endDate) {
        const pad = n => String(n).padStart(2, '0');
        const mStr = pad(currDate.getMonth() + 1);
        const dStr = pad(currDate.getDate());
        const yoil = yoils[currDate.getDay()];
        
        
        const todaysEvents = allEventsRaw.filter(ev => {
            const evStartStr = ev.startDate || ev.dateId;
            const evEndStr = ev.endDate || ev.dateId;
            const evS = evStartStr.split('-');
            const start = new Date(evS[0], parseInt(evS[1]) - 1, evS[2]);
            const evE = evEndStr.split('-');
            const end = new Date(evE[0], parseInt(evE[1]) - 1, evE[2]);
            return currDate >= start && currDate <= end;
        });

        todaysEvents.sort((a, b) => {
            const aS = (a.startDate || a.dateId).split('-');
            const startA = new Date(aS[0], parseInt(aS[1]) - 1, aS[2]).getTime(); 
            const bS = (b.startDate || b.dateId).split('-');
            const startB = new Date(bS[0], parseInt(bS[1]) - 1, bS[2]).getTime();
            if (startA !== startB) return startA - startB;
            return (a.order ?? 9999) - (b.order ?? 9999);
        });

        let dayGlobalType = '';
        let dayGlobalTime = '';
        todaysEvents.forEach(ev => {
            if (ev.dayGlobalType) dayGlobalType = ev.dayGlobalType;
            if (ev.dayGlobalTime) dayGlobalTime = ev.dayGlobalTime;
        });

        const isHubang = dayGlobalType === '휴방' || (todaysEvents.length > 0 && todaysEvents.every(ev => ev.type === '휴방' || (ev.isDummyGlobal && dayGlobalType === '휴방')));
        const validEvents = todaysEvents.filter(ev => !ev.isDummyGlobal && ev.type !== '휴방');

        if (isHubang) {
            resultText += `🖤 ${mStr}.${dStr} (${yoil})\n\n- 휴방 ⚫\n\n`;
        } else {
            resultText += `💚 ${mStr}.${dStr} (${yoil})\n\n`;
            const gTimeStr = dayGlobalTime ? formatTextTime(dayGlobalTime) : '시간 미정';
            resultText += `- ${gTimeStr} 🔴\n\n`;

            if (validEvents.length === 0) {
                resultText += `일정 미정\n\n`;
            } else {
                validEvents.forEach((ev, idx) => {
                    const timeStr = formatTextTime(ev.time);
                    let prefix = (idx > 0) ? '& ' : '';
                    
                    if (timeStr) {
                        resultText += `${prefix}${ev.title} | ${timeStr}\n\n`;
                    } else {
                        resultText += `${prefix}${ev.title}\n\n`;
                    }
                });
            }
        }
        
        // 플랫폼 간 붙여넣기 시 공백 유지를 위해 Zero-Width Space(\u200B) 추가
        resultText += '\u200B\n\n';
        currDate.setDate(currDate.getDate() + 1);
    }

    // 텍스트 맨 끝에 있는 필요 없는 공백 제거
    resultText = resultText.replace(/[\u200B\n\s]+$/, '');
    
    document.getElementById('scheduleTextPreview').value = resultText;
    document.getElementById('textCopyStep1').style.display = 'none';
    document.getElementById('textCopyStep2').style.display = 'flex';
};

window.copyScheduleText = function() {
    const text = document.getElementById('scheduleTextPreview').value;
    navigator.clipboard.writeText(text).then(() => {
        showToast('일정이 클립보드에 복사되었습니다.');
        closeModal('textCopyModal');
    }).catch(err => {
        showToast('복사에 실패했습니다.');
        console.error(err);
    });
};

Object.assign(window, {
    handleEventImgUpload, addMember, deleteMember,deletePopupImage,
    handlePopupImgUpload: window.handlePopupImgUpload,
    openMemberManager, renderMemberList, showToast, closeModal, formatTime12h,
    setAMPM, openAddModal, saveEvent, deleteEvent, showInfo,
    toggleMemo, openMemoInput, closeMemoInput, saveMemoItem, selectMemoTab, openMonthPicker, changePickerYear,
    toggleUpBoard, toggleMobileUpBoard, loadUpItems, deleteUpItem,
    promptAdmin, showAdminMenu, openAdminSettings, savePopupImage, saveUpItem, toggleMobileMemo,
    closeUpPopup, checkAndShowPopup, removeEventImage,
    openDayManager, renderDayManagerList, moveDayManagerItem, removeDayManagerItem, addDayManagerItem, uploadDayManagerImg, saveDayManager, deleteAllDayManagerItems,
    openTextCopyModal, resetTextCopyModal, generateScheduleText, copyScheduleText
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
    try {
        await seedAdmin();
        await loadData();
        initAuth(); // 여기서 로그인 상태를 파악함
        updateAdminUI(); // <--- 이 코드가 있는지 확인하세요! 반드시 있어야 합니다.
        
        await window.showTab('schedule');
    } catch (error) {
        console.error('초기 로딩 중 오류 발생:', error);
    }

    const btnMin = document.getElementById('btnMin');
    if(btnMin) btnMin.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    
    window.checkAndShowPopup();

    const loginBtns = document.querySelectorAll('#adminBtn, #adminBtn_pc');
    loginBtns.forEach(btn => {
        btn.onclick = (e) => {
            console.log("로그인 버튼이 클릭되었습니다.");
            window.promptAdmin(e);
        };
    });

    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        if (window.innerWidth !== lastWidth) {
            lastWidth = window.innerWidth;
            renderCalendar();
        }
    });

    setTimeout(() => {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) { loadingOverlay.classList.add('hidden'); }
    }, 1000);
};

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
});

window.addEventListener('error', () => {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
});

const loadingGifs = [
    "https://i.postimg.cc/13HBpsL3/Honeycam-2026-06-10-20-44-02.webp",
    "https://i.postimg.cc/Bngpx4dv/Honeycam-2026-06-10-20-45-47.webp",
    "https://i.postimg.cc/4x5PzsrN/Honeycam-2026-06-10-20-46-53.webp"
];

const randomLoadingImg = document.getElementById('randomLoadingImg');
if (randomLoadingImg) {
    randomLoadingImg.style.opacity = '0';
    randomLoadingImg.style.transition = 'opacity 0.3s ease'; 

    const randomGif = loadingGifs[Math.floor(Math.random() * loadingGifs.length)];
    let imageLoaded = false;
    
    randomLoadingImg.onload = () => {
        if (!imageLoaded) {
            imageLoaded = true;
            randomLoadingImg.style.opacity = '1';
        }
    };

    randomLoadingImg.onerror = () => {
        if (!imageLoaded) {
            imageLoaded = true;
            randomLoadingImg.style.opacity = '1';
            randomLoadingImg.alt = "이미지를 불러오지 못했습니다 🥲";
        }
    };

    // 타임아웃: 3초 후에도 이미지가 로드되지 않으면 계속 진행
    setTimeout(() => {
        if (!imageLoaded) {
            imageLoaded = true;
            randomLoadingImg.style.opacity = '1';
            randomLoadingImg.alt = "이미지 로딩 중...";
        }
    }, 3000);

    randomLoadingImg.src = randomGif;
}
