/**
 * Chép nguyên từ Social Wave (main/channels/zalo/session.test.ts) cùng với session.ts — giữ để chứng minh
 * bộ phiên đã chép (và phần Larkwave thêm vào) vẫn đúng như bản gốc.
 *
 * Chạy: node --test --experimental-strip-types main/channels/zalo/session.test.ts
 *
 * zca-js và Electron đều được thay bằng đồ giả: session.ts chỉ nạp chúng bên
 * trong hai hàm tạo mặc định, nên test không cần mock module nào cả.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {ChannelContext} from './session';
import {
    FileZaloCredentialStore,
    ZALO_EVENTS,
    ZaloSessionManager,
    classifyZaloFailure,
    isQrRecoverable,
    qrTransition,
    type QrLoginSnapshot,
    type QrState,
    type Scheduler,
    type SecretVault,
    type StoredZaloAccount,
    type ZaloApi,
    type ZaloClient,
    type ZaloCredentialStore,
    type ZaloCredentials,
    type ZaloListenHandlers,
    type ZaloQrEvent,
} from './session';

// ─── Đồ dùng chung ───────────────────────────────────────────────────────────

interface Recorder {
    ctx: ChannelContext;
    logs: Array<{level: string; msg: string}>;
    events: Array<{event: string; payload: unknown}>;
    qrStates(): QrState[];
    hasLog(level: string, needle: string): boolean;
}

function recorder(userDataDir = '/không-dùng'): Recorder {
    const logs: Array<{level: string; msg: string}> = [];
    const events: Array<{event: string; payload: unknown}> = [];
    return {
        ctx: {
            userDataDir,
            log: (level, msg) => {
                logs.push({level, msg});
            },
            emit: (event, payload) => {
                events.push({event, payload});
            },
        },
        logs,
        events,
        qrStates: () =>
            events
                .filter((e) => e.event === ZALO_EVENTS.qr)
                .map((e) => (e.payload as QrLoginSnapshot).state),
        hasLog: (level, needle) => logs.some((l) => l.level === level && l.msg.includes(needle)),
    };
}

interface FakeApi extends ZaloApi {
    handlers: ZaloListenHandlers | null;
    stopped: number;
    sent: Array<{text: string; threadId: string}>;
}

function fakeApi(userId: string): FakeApi {
    const api: FakeApi = {
        handlers: null,
        stopped: 0,
        sent: [],
        ownId: () => userId,
        account: async () => ({userId, name: `Người dùng ${userId}`, avatar: 'avatar.png', phone: `090000${userId}`}),
        friends: async () => [],
        findUserByPhone: async () => null,
        isFriend: async () => true,
        sendText: async (text, threadId) => {
            api.sent.push({text, threadId});
            return {msgId: 'msg-1'};
        },
        ping: async () => undefined,
        listen: (handlers) => {
            api.handlers = handlers;
        },
        stopListening: () => {
            api.stopped++;
            api.handlers = null;
        },
    };
    return api;
}

interface FakeClient extends ZaloClient {
    /** Kết quả cho từng lần login(), lấy theo thứ tự. */
    loginQueue: Array<FakeApi | Error>;
    loginCalls: ZaloCredentials[];
    emitQr(ev: ZaloQrEvent): void;
    finishQr(api: FakeApi): void;
    failQr(err: unknown): void;
}

function fakeClient(): FakeClient {
    let onEvent: ((ev: ZaloQrEvent) => void) | null = null;
    let settle: {resolve: (api: ZaloApi) => void; reject: (err: unknown) => void} | null = null;

    const client: FakeClient = {
        loginQueue: [],
        loginCalls: [],
        login: async (creds) => {
            client.loginCalls.push(creds);
            const next = client.loginQueue.shift();
            if (next === undefined) throw new Error('loginQueue rỗng');
            if (next instanceof Error) throw next;
            return next;
        },
        loginQR: (cb) =>
            new Promise<ZaloApi>((resolve, reject) => {
                onEvent = cb;
                settle = {resolve, reject};
            }),
        emitQr: (ev) => {
            assert.ok(onEvent, 'loginQR chưa được gọi');
            onEvent(ev);
        },
        finishQr: (api) => {
            assert.ok(settle, 'loginQR chưa được gọi');
            settle.resolve(api);
        },
        failQr: (err) => {
            assert.ok(settle, 'loginQR chưa được gọi');
            settle.reject(err);
        },
    };
    return client;
}

function memoryStore(seed: StoredZaloAccount[] = []): ZaloCredentialStore & {records: Map<string, StoredZaloAccount>} {
    const records = new Map<string, StoredZaloAccount>(seed.map((r) => [r.accountId, r]));
    return {
        records,
        list: async () => [...records.keys()],
        load: async (accountId) => records.get(accountId) ?? null,
        save: async (rec) => {
            records.set(rec.accountId, {...rec, savedAt: new Date().toISOString(), plaintext: false});
        },
        remove: async (accountId) => {
            records.delete(accountId);
        },
    };
}

function fakeScheduler(): {tasks: Array<{ms: number; fn: () => void}>; schedule: Scheduler; runNext(): number} {
    const tasks: Array<{ms: number; fn: () => void}> = [];
    const schedule: Scheduler = (fn, ms) => {
        const task = {fn, ms};
        tasks.push(task);
        return {
            cancel: () => {
                const i = tasks.indexOf(task);
                if (i >= 0) tasks.splice(i, 1);
            },
        };
    };
    return {
        tasks,
        schedule,
        runNext: () => {
            const task = tasks.shift();
            assert.ok(task, 'không có hẹn giờ nào đang chờ');
            task.fn();
            return task.ms;
        },
    };
}

async function until(check: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((r) => setTimeout(r, 1));
    }
    assert.fail(`Chờ quá lâu: ${label}`);
}

function credentials(tag: string): ZaloCredentials {
    return {
        imei: `imei-${tag}`,
        userAgent: 'Mozilla/5.0 (test)',
        cookie: [{name: 'zpsid', value: `bí-mật-${tag}`, domain: '.zalo.me'}],
        language: 'vi',
    };
}

function stored(accountId: string): StoredZaloAccount {
    return {
        accountId,
        label: `Người dùng ${accountId}`,
        avatar: '',
        phone: '',
        credentials: credentials(accountId),
        savedAt: new Date().toISOString(),
        plaintext: false,
    };
}

// ─── Máy trạng thái QR ───────────────────────────────────────────────────────

test('QR: luồng đăng nhập thành công đi hết các bước', () => {
    let state: QrState = 'idle';
    const seen: QrState[] = [];
    for (const event of ['start', 'qr-generated', 'qr-scanned', 'got-login-info', 'login-ok'] as const) {
        state = qrTransition(state, event);
        seen.push(state);
    }
    assert.deepEqual(seen, ['starting', 'awaiting-scan', 'scanned', 'authenticating', 'success']);
});

test('QR: xác nhận nhanh có thể bỏ qua bước "đã quét"', () => {
    assert.equal(qrTransition('awaiting-scan', 'got-login-info'), 'authenticating');
    assert.equal(qrTransition('starting', 'got-login-info'), 'authenticating');
});

test('QR: hết hạn thì tạo lại được mã trong cùng phiên', () => {
    const expired = qrTransition('awaiting-scan', 'qr-expired');
    assert.equal(expired, 'expired');
    assert.equal(qrTransition(expired, 'retry'), 'starting');
    assert.equal(qrTransition(expired, 'qr-generated'), 'awaiting-scan');
});

test('QR: từ chối, lỗi và huỷ đều phục hồi được', () => {
    assert.equal(qrTransition('scanned', 'qr-declined'), 'declined');
    assert.equal(qrTransition('authenticating', 'login-failed'), 'error');
    assert.equal(qrTransition('awaiting-scan', 'abort'), 'aborted');
    for (const state of ['expired', 'declined', 'error', 'aborted'] as const) {
        assert.equal(isQrRecoverable(state), true, state);
        assert.equal(qrTransition(state, 'start'), 'starting', state);
    }
    assert.equal(isQrRecoverable('success'), false);
});

test('QR: sự kiện không hợp lệ giữ nguyên trạng thái', () => {
    assert.equal(qrTransition('awaiting-scan', 'login-ok'), 'awaiting-scan');
    assert.equal(qrTransition('idle', 'qr-scanned'), 'idle');
    assert.equal(qrTransition('success', 'qr-expired'), 'success');
    // Đăng nhập xong vẫn mở được phiên mới: ứng dụng nhiều tài khoản Zalo.
    assert.equal(qrTransition('success', 'start'), 'starting');
});

// ─── Lưu thông tin đăng nhập ─────────────────────────────────────────────────

function fakeVault(available: boolean): SecretVault {
    return {
        encrypt: async (plain) => (available ? Buffer.from(plain, 'utf8').toString('base64') : null),
        decrypt: async (payload) => (available ? Buffer.from(payload, 'base64').toString('utf8') : null),
    };
}

async function tmpDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'zalo-creds-'));
}

test('Thông tin đăng nhập: mã hoá khi lưu, đọc lại nguyên vẹn', async (t) => {
    const dir = await tmpDir();
    t.after(() => fs.rm(dir, {recursive: true, force: true}));
    const rec = recorder();
    const store = new FileZaloCredentialStore(dir, fakeVault(true), rec.ctx.log);

    await store.save({accountId: '111', label: 'Shop A', avatar: 'a.png', phone: '0900000111', credentials: credentials('111')});

    const raw = await fs.readFile(path.join(dir, '111.json'), 'utf8');
    assert.equal(raw.includes('bí-mật-111'), false, 'cookie không được nằm dạng thường trên đĩa');
    assert.equal((JSON.parse(raw) as {enc: string}).enc, 'safe-storage');

    const loaded = await store.load('111');
    assert.ok(loaded);
    assert.equal(loaded.plaintext, false);
    assert.equal(loaded.label, 'Shop A');
    assert.deepEqual(loaded.credentials, credentials('111'));
    assert.deepEqual(await store.list(), ['111']);

    await store.remove('111');
    assert.equal(await store.load('111'), null);
    assert.deepEqual(await store.list(), []);
});

test('Thông tin đăng nhập: không có kho khoá thì ghi dạng thường và báo động rõ', async (t) => {
    const dir = await tmpDir();
    t.after(() => fs.rm(dir, {recursive: true, force: true}));
    const rec = recorder();
    const store = new FileZaloCredentialStore(dir, fakeVault(false), rec.ctx.log);

    await store.save({accountId: '222', label: 'Shop B', avatar: '', phone: '', credentials: credentials('222')});

    const envelope = JSON.parse(await fs.readFile(path.join(dir, '222.json'), 'utf8')) as {enc: string};
    assert.equal(envelope.enc, 'plaintext');
    assert.ok(rec.hasLog('error', 'KHÔNG mã hoá'), 'phải ghi log lỗi khi lưu dạng thường');

    const loaded = await store.load('222');
    assert.ok(loaded);
    assert.equal(loaded.plaintext, true);
    assert.deepEqual(loaded.credentials, credentials('222'));
    assert.ok(rec.hasLog('warn', 'đang lưu dạng thường'));
});

test('Thông tin đăng nhập: không giải mã được thì coi như chưa đăng nhập', async (t) => {
    const dir = await tmpDir();
    t.after(() => fs.rm(dir, {recursive: true, force: true}));
    const rec = recorder();
    await new FileZaloCredentialStore(dir, fakeVault(true), rec.ctx.log)
        .save({accountId: '333', label: '', avatar: '', phone: '', credentials: credentials('333')});

    // Máy khác / keychain khác: giải mã trả null.
    const other = new FileZaloCredentialStore(dir, fakeVault(false), rec.ctx.log);
    assert.equal(await other.load('333'), null);
    assert.ok(rec.hasLog('error', 'cần quét lại mã QR'));
});

test('Thông tin đăng nhập: tên tệp không nhận mã tài khoản lạ', async (t) => {
    const dir = await tmpDir();
    t.after(() => fs.rm(dir, {recursive: true, force: true}));
    const rec = recorder();
    const store = new FileZaloCredentialStore(dir, fakeVault(true), rec.ctx.log);

    await assert.rejects(
        () => store.save({accountId: '../thoát-ra', label: '', avatar: '', phone: '', credentials: credentials('x')}),
        /không hợp lệ/,
    );
    assert.equal(await store.load('../thoát-ra'), null);
});

// ─── Đăng nhập QR qua manager ────────────────────────────────────────────────

test('Manager: đăng nhập QR phát đủ các bước và lưu tài khoản', async () => {
    const rec = recorder();
    const client = fakeClient();
    const store = memoryStore();
    const manager = new ZaloSessionManager({ctx: rec.ctx, client, store, schedule: fakeScheduler().schedule});

    const first = await manager.beginQrLogin();
    assert.equal(first.state, 'starting');

    client.emitQr({kind: 'qr-generated', image: 'ẢNH-QR', retry: () => undefined, abort: () => undefined});
    assert.equal(manager.qrSnapshot().state, 'awaiting-scan');
    assert.equal(manager.qrSnapshot().image, 'ẢNH-QR');

    client.emitQr({kind: 'qr-scanned', displayName: 'Nguyễn Văn A', avatar: 'a.png'});
    assert.equal(manager.qrSnapshot().state, 'scanned');
    assert.equal(manager.qrSnapshot().scannedName, 'Nguyễn Văn A');

    client.emitQr({kind: 'got-login-info', credentials: credentials('111')});
    assert.equal(manager.qrSnapshot().state, 'authenticating');

    const api = fakeApi('111');
    client.finishQr(api);
    await until(() => manager.qrSnapshot().state === 'success', 'đăng nhập xong');

    assert.equal(manager.qrSnapshot().accountId, '111');
    assert.deepEqual(rec.qrStates(), ['starting', 'awaiting-scan', 'scanned', 'authenticating', 'success']);
    // loginQR đã trả về API dùng được: không đăng nhập lần thứ hai như bản cũ.
    assert.equal(client.loginCalls.length, 0);
    assert.deepEqual(store.records.get('111')?.credentials, credentials('111'));
    assert.equal(manager.readySessions().length, 1);
    assert.equal(manager.get('111')?.label, 'Người dùng 111');
    assert.ok(api.handlers, 'phải gắn listener sau khi đăng nhập');
});

test('Manager: mã QR hết hạn thì tạo lại trong cùng phiên', async () => {
    const rec = recorder();
    const client = fakeClient();
    const manager = new ZaloSessionManager({ctx: rec.ctx, client, store: memoryStore()});

    await manager.beginQrLogin();
    let retries = 0;
    const retry = (): void => {
        retries++;
        client.emitQr({kind: 'qr-generated', image: 'QR-MỚI'});
    };
    client.emitQr({kind: 'qr-generated', image: 'QR-CŨ', retry, abort: () => undefined});
    client.emitQr({kind: 'qr-expired', retry, abort: () => undefined});

    assert.equal(manager.qrSnapshot().state, 'expired');
    assert.equal(manager.qrSnapshot().image, undefined, 'mã hết hạn thì bỏ ảnh cũ đi');

    assert.equal(manager.retryQr(), true);
    assert.equal(retries, 1);
    assert.equal(manager.qrSnapshot().state, 'awaiting-scan');
    assert.equal(manager.qrSnapshot().image, 'QR-MỚI');
});

test('Manager: chỉ một phiên QR chạy mỗi lần', async () => {
    const rec = recorder();
    const client = fakeClient();
    const manager = new ZaloSessionManager({ctx: rec.ctx, client, store: memoryStore()});

    await manager.beginQrLogin();
    client.emitQr({kind: 'qr-generated', image: 'QR', retry: () => undefined, abort: () => undefined});
    const again = await manager.beginQrLogin();

    assert.equal(again.state, 'awaiting-scan');
    assert.ok(rec.hasLog('warn', 'đang chạy'));
});

test('Manager: đăng nhập QR thất bại thì về trạng thái lỗi', async () => {
    const rec = recorder();
    const client = fakeClient();
    const manager = new ZaloSessionManager({ctx: rec.ctx, client, store: memoryStore()});

    await manager.beginQrLogin();
    client.emitQr({kind: 'qr-generated', image: 'QR'});
    client.failQr(new Error('Cannot get scan result'));

    await until(() => manager.qrSnapshot().state === 'error', 'về trạng thái lỗi');
    assert.equal(manager.sessions().length, 0);
});

// ─── Nhiều tài khoản + khôi phục ─────────────────────────────────────────────

test('Manager: khôi phục từng tài khoản đã lưu, mỗi tài khoản một phiên riêng', async () => {
    const rec = recorder();
    const client = fakeClient();
    const api1 = fakeApi('111');
    const api2 = fakeApi('222');
    client.loginQueue.push(api1, api2);
    const manager = new ZaloSessionManager({
        ctx: rec.ctx,
        client,
        store: memoryStore([stored('111'), stored('222')]),
    });

    assert.equal(await manager.restoreAll(), 2);
    assert.deepEqual(manager.readySessions().map((s) => s.accountId).sort(), ['111', '222']);
    assert.deepEqual(client.loginCalls.map((c) => c.imei), ['imei-111', 'imei-222']);
    assert.ok(api1.handlers);
    assert.ok(api2.handlers);
});

test('Manager: phiên hết hiệu lực thì yêu cầu quét lại, không thử lại vô nghĩa', async () => {
    const rec = recorder();
    const client = fakeClient();
    client.loginQueue.push(new Error('Đăng nhập thất bại'));
    const clock = fakeScheduler();
    const manager = new ZaloSessionManager({
        ctx: rec.ctx,
        client,
        store: memoryStore([stored('111')]),
        schedule: clock.schedule,
    });

    assert.equal(await manager.restoreAll(), 0);
    assert.equal(manager.get('111')?.status, 'logged-out');
    assert.equal(clock.tasks.length, 0, 'lỗi xác thực thì không hẹn kết nối lại');
});

// ─── Kết nối lại ─────────────────────────────────────────────────────────────

async function readyManager(clock: ReturnType<typeof fakeScheduler>, rec: Recorder): Promise<{
    manager: ZaloSessionManager;
    client: FakeClient;
    api: FakeApi;
}> {
    const client = fakeClient();
    const api = fakeApi('111');
    client.loginQueue.push(api);
    const manager = new ZaloSessionManager({
        ctx: rec.ctx,
        client,
        store: memoryStore([stored('111')]),
        schedule: clock.schedule,
        maxReconnectAttempts: 3,
        reconnectBaseMs: 5_000,
    });
    await manager.restoreAll();
    assert.equal(manager.get('111')?.status, 'ready');
    return {manager, client, api};
}

test('Kết nối lại: backoff tăng gấp đôi rồi thành công', async () => {
    const rec = recorder();
    const clock = fakeScheduler();
    const {manager, client, api} = await readyManager(clock, rec);

    api.handlers?.onClosed(1006, 'abnormal closure');
    assert.equal(manager.get('111')?.status, 'reconnecting');
    assert.equal(clock.tasks.length, 1);

    // Lần 1 thất bại vì mạng: 5s (+ jitter tối đa 25%).
    const first = clock.tasks[0].ms;
    assert.ok(first >= 5_000 && first <= 6_250, `lần 1 chờ ${first}ms`);
    client.loginQueue.push(new Error('fetch failed'));
    clock.runNext();
    await until(() => clock.tasks.length === 1, 'hẹn lại lần 2');

    const second = clock.tasks[0].ms;
    assert.ok(second >= 10_000 && second <= 12_500, `lần 2 chờ ${second}ms`);

    const api2 = fakeApi('111');
    client.loginQueue.push(api2);
    clock.runNext();
    await until(() => manager.get('111')?.status === 'ready', 'kết nối lại được');

    assert.equal(manager.get('111')?.reconnectAttempts, 0, 'thành công thì đặt lại bộ đếm');
    assert.equal(clock.tasks.length, 0);
    assert.ok(api2.handlers, 'phiên mới phải có listener');
    assert.equal(api.stopped, 1, 'listener cũ phải được dừng');
});

test('Kết nối lại: hết số lần thử thì yêu cầu quét lại mã QR', async () => {
    const rec = recorder();
    const clock = fakeScheduler();
    const {manager, client, api} = await readyManager(clock, rec);

    api.handlers?.onClosed(1006, 'abnormal closure');
    // maxReconnectAttempts = 3: thử ba lần, thất bại cả ba thì bỏ cuộc.
    for (let attempt = 1; attempt <= 3; attempt++) {
        assert.equal(clock.tasks.length, 1, `phải có hẹn giờ cho lần ${attempt}`);
        client.loginQueue.push(new Error('fetch failed'));
        clock.runNext();
        if (attempt < 3) {
            await until(() => clock.tasks.length === 1, `hẹn lại lần ${attempt + 1}`);
        } else {
            await until(() => manager.get('111')?.status === 'logged-out', 'bỏ cuộc sau ba lần');
        }
    }

    assert.equal(clock.tasks.length, 0);
    assert.equal(manager.get('111')?.status, 'logged-out');
    assert.match(manager.get('111')?.message ?? '', /quét lại mã QR/);
});

test('Kết nối lại: Zalo đẩy phiên ra (3003) thì không thử lại', async () => {
    const rec = recorder();
    const clock = fakeScheduler();
    const {manager, api} = await readyManager(clock, rec);

    api.handlers?.onClosed(3003, 'kicked');

    assert.equal(clock.tasks.length, 0);
    assert.equal(manager.get('111')?.status, 'logged-out');
    assert.equal(manager.readySessions().length, 0);
});

test('Kết nối lại: tự đóng (1000) và socket trùng (3000) đều bỏ qua', async () => {
    const rec = recorder();
    const clock = fakeScheduler();
    const {manager, api} = await readyManager(clock, rec);

    api.handlers?.onClosed(1000, 'manual');
    api.handlers?.onClosed(3000, 'duplicate');

    assert.equal(clock.tasks.length, 0);
    assert.equal(manager.get('111')?.status, 'ready');
});

test('Kết nối lại: mất thông tin đăng nhập thì dừng hẳn', async () => {
    const rec = recorder();
    const clock = fakeScheduler();
    const client = fakeClient();
    client.loginQueue.push(fakeApi('111'));
    const store = memoryStore([stored('111')]);
    const manager = new ZaloSessionManager({ctx: rec.ctx, client, store, schedule: clock.schedule});
    await manager.restoreAll();

    store.records.delete('111');
    assert.equal(await manager.reconnect('111'), false);
    assert.equal(manager.get('111')?.status, 'logged-out');
    assert.equal(clock.tasks.length, 0);
});

test('Đăng xuất: xoá phiên, dừng listener và xoá thông tin đăng nhập', async () => {
    const rec = recorder();
    const clock = fakeScheduler();
    const client = fakeClient();
    const api = fakeApi('111');
    client.loginQueue.push(api);
    const store = memoryStore([stored('111')]);
    const manager = new ZaloSessionManager({ctx: rec.ctx, client, store, schedule: clock.schedule});
    await manager.restoreAll();

    await manager.logout('111');

    assert.equal(manager.sessions().length, 0);
    assert.equal(store.records.size, 0);
    assert.equal(api.stopped, 1);
});

test('dispose: dừng mọi listener và huỷ mọi hẹn giờ', async () => {
    const rec = recorder();
    const clock = fakeScheduler();
    const {manager, api} = await readyManager(clock, rec);

    api.handlers?.onClosed(1006, 'abnormal closure');
    assert.equal(clock.tasks.length, 1);

    await manager.dispose();
    assert.equal(clock.tasks.length, 0);
    assert.equal(api.stopped, 1);
});

// ─── Phân loại lỗi ───────────────────────────────────────────────────────────

test('Phân loại lỗi zca-js thành SendErrorKind', () => {
    const cases: Array<[unknown, string]> = [
        [new Error('Đăng nhập thất bại'), 'auth'],
        [new Error('Request failed with status code 401'), 'auth'],
        [new Error('Tài khoản của bạn bị khoá do vi phạm'), 'blocked'],
        [new Error('Request failed with status code 403'), 'blocked'],
        [new Error('Bạn gửi quá nhiều tin, thử lại sau'), 'rate-limited'],
        [new Error('Request failed with status code 429'), 'rate-limited'],
        [new Error('Không tìm thấy người dùng'), 'invalid-recipient'],
        [new Error('recipient is not a friend'), 'invalid-recipient'],
        [new Error('fetch failed'), 'transient'],
        [Object.assign(new Error('read error'), {code: 'ECONNRESET'}), 'transient'],
        [new Error('Request failed with status code 502'), 'transient'],
        [new Error('chuyện gì đó lạ lắm'), 'unknown'],
        [undefined, 'unknown'],
    ];
    for (const [err, expected] of cases) {
        assert.equal(classifyZaloFailure(err), expected, String(err));
    }
});
