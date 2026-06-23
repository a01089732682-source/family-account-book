const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 💡 [웹소켓 추가] HTTP 및 Socket.io 모듈 로드
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app); // Express를 HTTP 서버로 래핑
const io = new Server(server);         // 실시간 방송국(io) 기동!

const PORT = process.env.PORT || 3000; // 클라우드가 주는 포트를 쓰고 없으면 3000

// 1. 미들웨어 설정 (JSON 파싱 및 정적 파일 경로)
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 2. 클라우드 영구 저장 디스크 경로 지원 SQLite 파일 연결
const dbDir = process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const dbPath = path.join(dbDir, 'account_book.db');

// 🔥 [여기를 추가] 만약 지목한 폴더(/data)가 물리적으로 없으면 자동으로 생성해 주는 방어 코드!
const fs = require('fs');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`📁 DB 저장 폴더가 없어서 새로 생성함: ${dbDir}`);
}

// 그 이후 DB 연결 진행
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ DB 금고 연결 실패:', err.message);
    else console.log(`⚡ DB 연결 성공 (경로: ${dbPath})`);
});

// 💡 [웹소켓 추가] 단말기(브라우저/스마트폰) 접속 이벤트 리스너
io.on('connection', (socket) => {
    console.log('⚡ 새로운 가계부 단말기가 실시간망에 연결되었습니다.');
    
    socket.on('disconnect', () => {
        console.log('🔌 단말기 연결이 해제되었습니다.');
    });
});

/**
 * [API 1] 📤 가계부 내역 조회 (GET /api/history)
 */
app.get('/api/history', (req, res) => {
    const sql = `
        SELECT A.id, A.pay_date, C.code_name_han, C.etc1_value, A.amount, A.note
        FROM account_book A
        INNER JOIN category_sub_code C ON A.category_sub_code = C.category_sub_code
        ORDER BY A.pay_date DESC, A.id DESC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

/**
 * [API 2] 📥 가계부 내역 저장 (POST /api/history)
 * 💡 [웹소켓 추가] 저장 성공 시 전체 단말기에 실시간 브로드캐스트 발생
 */
app.post('/api/history', (req, res) => {
    const { pay_date, category_sub_code, amount, note } = req.body;

    if (!pay_date || !category_sub_code || !amount) {
        res.status(400).json({ error: "필수 데이터가 빠졌단다!" });
        return;
    }

    // 💡 아빠의 실제 테이블명(account_book) 포맷 유지
    const sql = `INSERT INTO account_book (pay_date, category_sub_code, amount, note) VALUES (?, ?, ?, ?)`;
    const params = [pay_date, category_sub_code, amount, note];

    db.run(sql, params, function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // 🔥 [실시간 핵심 리인포스] DB에 성공적으로 데이터가 꽂히면, 
        // 현재 웹소켓망에 뚫려있는 아빠 노트북, 피콕이 폰 등 모든 기기에 "데이터 바뀜!" 신호를 방송합니다.
        io.emit('database_changed', { message: '가계부에 새로운 기록이 업데이트 되었단다!' });

        res.json({ message: "성공적으로 저장 완료!", id: this.lastID });
    });
});

// 3. 루트 경로 처리 (index.html 강제 매핑 보완 유지)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 4. 서버 기동 
// 💡 기존 app.listen에서 server.listen으로 변경하여 HTTP와 웹소켓 포트를 하나로 통합기동합니다.
server.listen(PORT, () => {
    console.log(`🚀 실시간 가계부 백엔드 서버가 http://localhost:${PORT} 에서 달리는 중!`);
});