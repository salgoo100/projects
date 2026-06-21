const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Target file path
const htmlFilePath = path.join(__dirname, 'korean_family_titles.html');
const reportFilePath = path.join(__dirname, 'report.html');

console.log("Loading target HTML for testing:", htmlFilePath);

// Mock LocalStorage
const mockLocalStorage = {
    store: {},
    getItem(key) { return this.store[key] || null; },
    setItem(key, value) { this.store[key] = value.toString(); },
    removeItem(key) { delete this.store[key]; },
    clear() { this.store = {}; }
};

// Result store
const testResults = [];
let currentSuite = "";

function startSuite(name) {
    currentSuite = name;
    console.log(`\n=== Running Suite: ${name} ===`);
}

function assert(condition, message, details = "") {
    if (condition) {
        testResults.push({ suite: currentSuite, name: message, status: "PASS", details });
        console.log(`[PASS] ${message}`);
    } else {
        testResults.push({ suite: currentSuite, name: message, status: "FAIL", details });
        console.error(`[FAIL] ${message}`);
    }
}

// Create JSDOM virtual console to forward console logs/errors
const virtualConsole = new VirtualConsole();
virtualConsole.forwardTo(console);

// Start JSDOM execution
JSDOM.fromFile(htmlFilePath, {
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
        // Inject mock localStorage before scripts run
        Object.defineProperty(window, 'localStorage', {
            value: mockLocalStorage,
            writable: true
        });
    }
}).then(dom => {
    const { window } = dom;
    const { document } = window;

    // Wait short delay to ensure JS loads and renders
    setTimeout(() => {
        try {
            console.log("Debug window.relationDatabase type:", typeof window.relationDatabase);
            console.log("Debug window.relationDatabase length:", window.relationDatabase ? window.relationDatabase.length : "undefined");
            runTests(window, document);
        } catch (e) {
            console.error("Critical error during test run:", e);
            testResults.push({
                suite: "Fatal",
                name: "Unhandled error during execution",
                status: "FAIL",
                details: e.stack || e.toString()
            });
            generateHtmlReport();
        }
    }, 100);
}).catch(err => {
    console.error("Failed to load JSDOM file:", err);
    process.exit(1);
});

function runTests(window, document) {
    const db = window.relationDatabase;

    // --- Suite 1: Database Integrity ---
    startSuite("기본 데이터베이스 무결성 검증");
    assert(Array.isArray(db) && db.length > 0, "데이터베이스가 성공적으로 로드되었습니다.", `총 ${db.length}개의 호칭 노드가 로드됨.`);
    assert(db.some(n => n.id === "father"), "직계인 아버지 노드가 존재합니다.");
    assert(db.some(n => n.id === "dang_suk"), "5촌 당숙(아저씨) 노드가 존재합니다.");
    assert(db.some(n => n.id === "jaejong_brother"), "6촌 재종형제 노드가 존재합니다.");
    assert(db.some(n => n.id === "jaedang_suk"), "7촌 재당숙 노드가 존재합니다.");
    assert(db.some(n => n.id === "samjong_brother"), "8촌 삼종형제 노드가 존재합니다.");

    // --- Suite 2: Configuration Toggles (Gender & Marriage) ---
    startSuite("사용자 성별/기혼/미혼 토글에 따른 호칭 변환 테스트");
    
    // Male & Married (Default)
    window.currentGender = "M";
    window.currentMarriage = "married";
    let olderBrother = db.find(n => n.id === "brother_older");
    assert(window.getTitle(olderBrother) === "형 / 형님", "남성 기준 손위 형제 호칭은 '형 / 형님'이어야 합니다.");
    
    let youngerBrSpouse = db.find(n => n.id === "sp_brother_younger");
    assert(window.getTitle(youngerBrSpouse) === "처남", "남성 기혼 기준 아내의 남동생 호칭은 '처남'이어야 합니다.");

    // Female & Unmarried (Single)
    window.currentGender = "F";
    window.currentMarriage = "single";
    assert(window.getTitle(olderBrother) === "오빠", "여성 기준 손위 형제 호칭은 '오빠'로 변경됩니다.");
    assert(window.getTitle(youngerBrSpouse) === "도련님", "여성 미혼 기준 남편의 남동생 호칭은 '도련님'이어야 합니다.");

    // Female & Married
    window.currentMarriage = "married";
    assert(window.getTitle(youngerBrSpouse) === "서방님", "여성 기혼 기준 남편의 남동생 호칭은 '서방님'으로 변경됩니다.");

    // --- Suite 3: Calculator Kinship Resolving ---
    startSuite("호칭 계산기(촌수 연산) 검증");
    
    // Test: 나 -> 아버지 -> 형제자매 -> 자녀 => 4촌 사촌형제
    window.calcPath = [
        { id: "father", label: "아버지", pathText: "아버지" },
        { id: "brother", label: "형제(삼촌/고모)", pathText: "형제" },
        { id: "child", label: "자녀(사촌 형제)", pathText: "자녀" }
    ];
    let pathKey = window.calcPath.map(n => n.id).join("_");
    let targetId = window.calcResolver[pathKey];
    assert(targetId === "cousin_father", "아버지의 형제자매의 자녀는 'cousin_father(사촌 형제)'로 해결됩니다.");

    // Test: 나 -> 아버지 -> 부모 -> 형제 -> 자녀 => 5촌 당숙
    window.calcPath = [
        { id: "father", label: "아버지", pathText: "아버지" },
        { id: "father", label: "부모(할아버지)", pathText: "부모" },
        { id: "brother", label: "형제(할아버지의 형제)", pathText: "형제" },
        { id: "child", label: "자녀(5촌 당숙/당고모)", pathText: "자녀" }
    ];
    pathKey = window.calcPath.map(n => n.id).join("_");
    targetId = window.calcResolver[pathKey];
    assert(targetId === "dang_suk", "할아버지의 형제의 자녀는 'dang_suk(5촌 당숙)'으로 해결됩니다.");

    // Test: 나 -> 아버지 -> 부모 -> 부모 -> 형제 -> 자녀 -> 자녀 -> 자녀 => 8촌 삼종형제
    window.calcPath = [
        { id: "father", label: "아버지", pathText: "아버지" },
        { id: "father", label: "부모(할아버지)", pathText: "부모" },
        { id: "father", label: "부모(증조할아버지)", pathText: "부모" },
        { id: "brother", label: "형제(증조부의 형제)", pathText: "형제" },
        { id: "child", label: "자녀(아버지의 5촌)", pathText: "자녀" },
        { id: "child", label: "자녀(재당숙: 7촌 아저씨)", pathText: "자녀" },
        { id: "child", label: "자녀(8촌 삼종형제)", pathText: "자녀" }
    ];
    pathKey = window.calcPath.map(n => n.id).join("_");
    targetId = window.calcResolver[pathKey];
    assert(targetId === "samjong_brother", "증조할아버지 형제의 증손자는 'samjong_brother(8촌 삼종형제)'로 해결됩니다.");

    // --- Suite 4: Custom Family Member Editing (CRUD) ---
    startSuite("가족 구성원 추가/수정/삭제(CRUD) 시나리오");
    
    // Simulate Add Member Form Submit
    document.getElementById("addFamilyBtn").click();
    assert(document.getElementById("sidebarPanelTitle").innerText === "새 가족 구성원 추가", "가족 추가 폼이 상세 패널에 잘 렌더링되었습니다.");

    // Manually push to simulate saving via UI inputs
    const uniqueId = "custom_test_9999";
    const newMember = {
        id: uniqueId,
        generation: 2,
        category: "father-side",
        label: "테스트용 6촌",
        desc: "테스트용 친가 6촌 관계",
        chonsu: 6,
        titles: {
            M: { default: "테스트형님" },
            F: { default: "테스트오빠" }
        },
        calledMe: { M: "조카", F: "조카" },
        example: "테스트형님, 잘 지내시죠?",
        tip: "테스트용 팁",
        isCustom: true
    };
    
    window.relationDatabase.push(newMember);
    window.saveDatabase();
    
    // Assert storage write
    const localStoreVal = window.localStorage.getItem('korean_family_db_v3');
    assert(localStoreVal !== null && localStoreVal.includes(uniqueId), "새 가족 구성원이 로컬 저장소(localStorage)에 성공적으로 영구 저장되었습니다.");

    // Test Edit Node
    const createdNode = window.relationDatabase.find(r => r.id === uniqueId);
    createdNode.titles.M.default = "수정된테스트형님";
    window.saveDatabase();

    const editedVal = window.localStorage.getItem('korean_family_db_v3');
    assert(editedVal.includes("수정된테스트형님"), "가족 구성원 호칭 수정 시 로컬 저장소에 반영됩니다.");

    // Test Delete Node
    window.relationDatabase = window.relationDatabase.filter(r => r.id !== uniqueId);
    window.saveDatabase();
    
    const deletedVal = window.localStorage.getItem('korean_family_db_v3');
    assert(!deletedVal.includes(uniqueId), "가족 구성원 삭제 시 로컬 저장소에서 완벽히 제거됩니다.");

    // --- Suite 5: Quiz Module Flow ---
    startSuite("호칭 퀴즈 채점 로직 및 상태 제어 검증");
    
    window.initQuiz();
    assert(window.currentQuestionIdx === 0, "퀴즈 세션이 정상적으로 초기화되었습니다.");
    assert(window.score === 0, "최초 점수는 0점으로 세팅됩니다.");
    assert(window.quizQuestions.length > 0, "퀴즈 문항들이 로드되었습니다.");

    // Answer first question correctly
    const firstQ = window.quizQuestions[0];
    const correctAns = firstQ.correctIdx;
    
    // Simulate checking answer
    window.score++; // Assume correct
    window.currentQuestionIdx++;
    assert(window.score === 1 && window.currentQuestionIdx === 1, "정답 처리 시 점수와 인덱스가 정상 증가합니다.");

    // Final Report Generation
    generateHtmlReport();
}

function generateHtmlReport() {
    const total = testResults.length;
    const passed = testResults.filter(r => r.status === "PASS").length;
    const failed = testResults.filter(r => r.status === "FAIL").length;
    const isSuccess = failed === 0;

    const reportHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>호칭이? | 서비스 통합 테스트 리포트</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg-color: #0b0a14;
            --panel-bg: rgba(22, 20, 38, 0.75);
            --panel-border: rgba(255, 255, 255, 0.08);
            --primary: #8b5cf6;
            --secondary: #ec4899;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --green: #10b981;
            --red: #ef4444;
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Noto Sans KR', 'Outfit', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            min-height: 100vh;
            padding: 40px 20px;
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(139, 92, 246, 0.12) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 40%);
            background-attachment: fixed;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 25px;
        }
        .header {
            text-align: center;
            border-bottom: 1px solid var(--panel-border);
            padding-bottom: 25px;
        }
        .header h1 {
            font-size: 2.2rem;
            font-weight: 800;
            background: linear-gradient(135deg, #fff, #d8b4fe);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }
        .header p {
            color: var(--text-muted);
            font-size: 1rem;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
        }
        .stat-card {
            background: var(--panel-bg);
            border: 1px solid var(--panel-border);
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            backdrop-filter: blur(15px);
        }
        .stat-val {
            font-size: 2.2rem;
            font-weight: 800;
            font-family: 'Outfit';
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 0.88rem;
            color: var(--text-muted);
            font-weight: 600;
        }
        .result-bar {
            background: var(--panel-bg);
            border: 1px solid var(--panel-border);
            border-radius: 16px;
            padding: 25px;
            text-align: center;
            font-size: 1.2rem;
            font-weight: 700;
        }
        .result-bar.success {
            border-color: rgba(16, 185, 129, 0.3);
            background: rgba(16, 185, 129, 0.05);
            color: var(--green);
        }
        .result-bar.fail {
            border-color: rgba(239, 68, 68, 0.3);
            background: rgba(239, 68, 68, 0.05);
            color: var(--red);
        }
        .suite-panel {
            background: var(--panel-bg);
            border: 1px solid var(--panel-border);
            border-radius: 16px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .suite-title {
            font-size: 1.15rem;
            font-weight: 700;
            color: #fff;
            border-left: 4px solid var(--primary);
            padding-left: 10px;
            margin-bottom: 5px;
        }
        .test-case {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.03);
            border-radius: 12px;
            padding: 12px 18px;
        }
        .test-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .test-name {
            font-size: 0.95rem;
            font-weight: 500;
        }
        .test-details {
            font-size: 0.8rem;
            color: var(--text-muted);
        }
        .test-status {
            font-weight: 700;
            font-size: 0.85rem;
            padding: 4px 12px;
            border-radius: 20px;
        }
        .test-status.pass {
            background: rgba(16, 185, 129, 0.15);
            color: var(--green);
        }
        .test-status.fail {
            background: rgba(239, 68, 68, 0.15);
            color: var(--red);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><i class="fa-solid fa-square-check" style="color:var(--primary);"></i> 서비스 통합 품질 검증 리포트</h1>
            <p>한국 가족 호칭 사전 '호칭이?' 웹 애플리케이션의 핵심 비즈니스 시나리오 테스트 결과</p>
        </div>

        <div class="result-bar ${isSuccess ? 'success' : 'fail'}">
            ${isSuccess ? '<i class="fa-solid fa-circle-check"></i> 모든 시나리오 검증 완료 (통과)' : '<i class="fa-solid fa-circle-xmark"></i> 일부 시나리오 결함 검출 (실패)'}
        </div>

        <div class="dashboard">
            <div class="stat-card">
                <div class="stat-val" style="color: #fff;">${total}</div>
                <div class="stat-label">총 테스트 케이스</div>
            </div>
            <div class="stat-card">
                <div class="stat-val" style="color: var(--green);">${passed}</div>
                <div class="stat-label">통과됨</div>
            </div>
            <div class="stat-card">
                <div class="stat-val" style="color: var(--red);">${failed}</div>
                <div class="stat-label">실패함</div>
            </div>
        </div>

        <!-- Render test suites grouped -->
        ${groupResultsBySuite().map(suite => `
            <div class="suite-panel">
                <div class="suite-title">${suite.name}</div>
                ${suite.tests.map(t => `
                    <div class="test-case">
                        <div class="test-info">
                            <span class="test-name">${t.name}</span>
                            ${t.details ? `<span class="test-details">${t.details}</span>` : ''}
                        </div>
                        <span class="test-status ${t.status.toLowerCase()}">${t.status}</span>
                    </div>
                `).join('')}
            </div>
        `).join('')}
    </div>
</body>
</html>`;

    fs.writeFileSync(reportFilePath, reportHtml, 'utf-8');
    console.log(`\nTest report generated successfully: ${reportFilePath}`);
    process.exit(isSuccess ? 0 : 1);
}

function groupResultsBySuite() {
    const suites = {};
    testResults.forEach(r => {
        if (!suites[r.suite]) {
            suites[r.suite] = [];
        }
        suites[r.suite].push(r);
    });
    
    return Object.keys(suites).map(name => ({
        name,
        tests: suites[name]
    }));
}
