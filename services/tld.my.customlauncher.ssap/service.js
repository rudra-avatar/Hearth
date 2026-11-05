// Hearth helper service (S3). A web page cannot choose its own Origin header, and newer LG firmware closes the page's
// connection to the TV's remote-control port (SSAP, 127.0.0.1:3000) with code 1008 before anything is said. This service
// opens the same websocket from plain Node, where the Origin can be set. Plain ES5 (old webOS runs Node 0.12).
// It only talks to the TV itself (127.0.0.1) and only sends: the register message the page gives, and two read-only
// requests from a short list. It runs only while the page calls it; nothing starts at boot.

var Service = require('webos-service');
var net = require('net');
var tls = require('tls');
var crypto = require('crypto');

var service = new Service('tld.my.customlauncher.ssap');
var HOST = '127.0.0.1';
var ALLOWED = ['ssap://com.webos.applicationManager/listLaunchPoints', 'ssap://tv/getExternalInputList'];

// Routes tried in this order (origin '' = no Origin header). The first one that gets any answer wins.
var TRIES = [
	{port: 3000, tls: false, origin: 'file://'},
	{port: 3000, tls: false, origin: ''},
	{port: 3000, tls: false, origin: 'file://tld.my.customlauncher'},
	{port: 3000, tls: false, origin: 'http://localhost'},
	{port: 3001, tls: true, origin: 'file://'},
	{port: 3001, tls: true, origin: ''}
];

function mk (n) { return Buffer.alloc ? Buffer.alloc(n) : new Buffer(n); }
function from (x, enc) { return (Buffer.from && Buffer.from !== Uint8Array.from) ? Buffer.from(x, enc) : new Buffer(x, enc); }
function text (e) { return String(e && e.message ? e.message : e); }

// One client frame (masked, as the websocket standard asks of clients).
function frame (op, payload) {
	var len = payload.length, head, mask = crypto.randomBytes(4), body = mk(len), i;
	if (len < 126) { head = mk(2); head[1] = 128 | len; }
	else if (len < 65536) { head = mk(4); head[1] = 128 | 126; head.writeUInt16BE(len, 2); }
	else { head = mk(10); head[1] = 128 | 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6); }
	head[0] = 128 | op;
	for (i = 0; i < len; i++) body[i] = payload[i] ^ mask[i & 3];
	return Buffer.concat([head, mask, body]);
}

// Opens a websocket to the route t. Handlers: onopen(), onmessage(text), onclose(info). info = {stage, status, code, reason, error}.
function wsOpen (t, h) {
	var sock, closed = false, raw = mk(0), upgraded = false, parts = [];
	var key = crypto.randomBytes(16).toString('base64');
	var req = 'GET / HTTP/1.1\r\nHost: ' + HOST + ':' + t.port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key +
		'\r\nSec-WebSocket-Version: 13\r\n' + (t.origin ? 'Origin: ' + t.origin + '\r\n' : '') + '\r\n';
	function end (info) {
		if (closed) return;
		closed = true;
		try { sock.destroy(); } catch (e) { /* ignore */ }
		h.onclose(info);
	}
	function send (op, payload) {
		try { sock.write(frame(op, payload)); } catch (e) { end({stage: 'send', error: text(e)}); }
	}
	function frames () {
		for (;;) {
			if (closed || raw.length < 2) return;
			var op = raw[0] & 15, fin = (raw[0] & 128) !== 0, masked = (raw[1] & 128) !== 0, len = raw[1] & 127, off = 2, mask = null, body, k;
			if (len === 126) { if (raw.length < 4) return; len = raw.readUInt16BE(2); off = 4; }
			else if (len === 127) { if (raw.length < 10) return; len = raw.readUInt32BE(2) * 4294967296 + raw.readUInt32BE(6); off = 10; }
			if (masked) { if (raw.length < off + 4) return; mask = raw.slice(off, off + 4); off += 4; }
			if (raw.length < off + len) return;
			body = raw.slice(off, off + len);
			raw = raw.slice(off + len);
			if (mask) { for (k = 0; k < body.length; k++) body[k] ^= mask[k & 3]; }
			if (op === 8) { end({stage: 'closed', code: body.length >= 2 ? body.readUInt16BE(0) : null, reason: body.length > 2 ? body.slice(2).toString('utf8') : ''}); return; }
			if (op === 9) { send(10, body); continue; }
			if (op === 0 || op === 1 || op === 2) {
				parts.push(body);
				if (fin) { var t8 = Buffer.concat(parts).toString('utf8'); parts = []; h.onmessage(t8); }
			}
		}
	}
	function onData (chunk) {
		raw = Buffer.concat([raw, chunk]);
		if (!upgraded) {
			var s = raw.toString('binary'), i = s.indexOf('\r\n\r\n');
			if (i < 0) { if (raw.length > 16384) end({stage: 'handshake', status: 'reply too long'}); return; }
			var line = s.slice(0, s.indexOf('\r\n'));
			if (!/^HTTP\/1\.[01] 101/.test(line)) { end({stage: 'handshake', status: line.slice(0, 60)}); return; }
			upgraded = true;
			sock.setTimeout(0);
			raw = raw.slice(i + 4);
			h.onopen();
		}
		frames();
	}
	function ready () { sock.write(req); }
	var opts = {host: HOST, port: t.port};
	try {
		if (t.tls) { opts.rejectUnauthorized = false; sock = tls.connect(opts, ready); } else { sock = net.connect(opts, ready); }
	} catch (e) { setTimeout(function () { end({stage: 'socket', error: text(e)}); }, 0); return {send: function () {}, close: function () { closed = true; }}; }
	sock.setTimeout(4000, function () { end({stage: 'socket', error: 'timeout'}); });
	sock.on('data', onData);
	sock.on('error', function (e) { end({stage: 'socket', error: String((e && e.code) || text(e))}); });
	sock.on('close', function () { end({stage: 'closed', code: null, reason: 'dropped without a close frame'}); });
	return {
		sendText: function (s) { send(1, from(s, 'utf8')); },
		close: function () { closed = true; try { sock.destroy(); } catch (e) { /* ignore */ } }
	};
}

// One attempt on route t: register, wait for the answer (and the person's OK when the TV asks), optionally read one URI.
// done(result). result: ok, replied, prompted, key, payload, error, plus the close info.
function attempt (t, registerText, uri, waitMs, done) {
	var r = {port: t.port, tls: t.tls, origin: t.origin, ok: false, replied: false, prompted: false};
	var ws, finished = false, timer = null, started = Date.now();
	function finish (extra) {
		if (finished) return;
		finished = true;
		if (timer) clearTimeout(timer);
		var k;
		for (k in extra) { if (extra.hasOwnProperty(k)) r[k] = extra[k]; }
		r.ms = Date.now() - started;
		try { ws.close(); } catch (e) { /* ignore */ }
		done(r);
	}
	function arm (ms, why) { if (timer) clearTimeout(timer); timer = setTimeout(function () { finish({error: why}); }, ms); }
	arm(8000, 'no reply');
	ws = wsOpen(t, {
		onopen: function () { ws.sendText(registerText); },
		onmessage: function (s) {
			var m, p;
			try { m = JSON.parse(s); } catch (e) { return; }
			r.replied = true;
			p = m.payload || {};
			if (m.type === 'response' && p.pairingType) { r.prompted = true; arm(waitMs, 'nobody pressed OK in time'); }
			else if (m.type === 'registered') {
				r.key = String(p['client-key'] || '');
				if (uri) { arm(15000, 'no answer to the request'); ws.sendText(JSON.stringify({id: 'hearth_svc', type: 'request', uri: uri, payload: {}})); }
				else finish({ok: true});
			} else if (m.id === 'hearth_svc') {
				if (m.type === 'error') finish({error: String(m.error || 'error')});
				else finish({ok: true, payload: p});
			} else if (m.type === 'error') finish({error: String(m.error || 'the TV refused')});
		},
		onclose: function (info) { finish(info); }
	});
}

// The page may name a route only from the list above.
function routeOf (p) {
	var i;
	for (i = 0; i < TRIES.length; i++) {
		if (TRIES[i].port === p.port && TRIES[i].tls === !!p.tls && TRIES[i].origin === (p.origin || '')) return TRIES[i];
	}
	return null;
}

// Keeps the service alive while a call is waiting (the TV may wait for the person to press OK).
function keeping (fn) {
	var act = null, released = false;
	function release () {
		if (released) return;
		released = true;
		try { if (act) service.activityManager.complete(act, function () {}); } catch (e) { /* ignore */ }
	}
	try { service.activityManager.create('hearth-ssap-' + Date.now(), function (a) { act = a; if (released) release(); }); } catch (e) { /* ignore */ }
	fn(release);
}

// pair {registers: [text, ...], waitMs}: tries every route with every register text until one gets any answer.
service.register('pair', function (message) {
	var p = message.payload || {}, regs = p.registers instanceof Array ? p.registers : [], waitMs = Math.min(Number(p.waitMs) || 60000, 90000);
	var results = [], ti = 0, ri = 0;
	if (!regs.length) { message.respond({returnValue: false, errorText: 'no register message given'}); return; }
	keeping(function (release) {
		function next () {
			var t, reg;
			if (ti >= TRIES.length) { release(); message.respond({returnValue: true, results: results}); return; }
			t = TRIES[ti]; reg = ri;
			attempt(t, String(regs[reg]), '', waitMs, function (r) {
				var c = {port: r.port, tls: r.tls, origin: r.origin, reg: reg, replied: r.replied, prompted: r.prompted, ok: r.ok};
				if (r.code !== undefined) c.code = r.code;
				if (r.reason) c.reason = String(r.reason).slice(0, 40);
				if (r.status) c.status = r.status;
				if (r.error) c.error = String(r.error).slice(0, 60);
				results.push(c);
				if (r.replied) { release(); message.respond({returnValue: true, results: results, key: r.key || '', route: r.ok ? {port: r.port, tls: r.tls, origin: r.origin, reg: reg} : null}); return; }
				// the TV closed the door early: next register text on this route, then the next route
				if (ri + 1 < regs.length && r.stage === 'closed' && r.code !== undefined) { ri++; } else { ri = 0; ti++; }
				next();
			});
		}
		next();
	});
});

// list {route: {port, tls, origin}, register: text, uri}: the paired read. Answers {payload} or {prompted: true} (key not accepted).
service.register('list', function (message) {
	var p = message.payload || {}, t = routeOf(p.route || {}), uri = String(p.uri || '');
	if (!t) { message.respond({returnValue: false, errorText: 'unknown route'}); return; }
	if (ALLOWED.indexOf(uri) < 0) { message.respond({returnValue: false, errorText: 'request not allowed'}); return; }
	keeping(function (release) {
		attempt(t, String(p.register || ''), uri, 8000, function (r) {
			release();
			if (r.ok) message.respond({returnValue: true, payload: r.payload || {}});
			else if (r.prompted) message.respond({returnValue: true, prompted: true});
			else message.respond({returnValue: false, errorText: r.error || (r.code !== undefined ? 'the TV closed the connection (code ' + r.code + ')' : r.status || 'failed')});
		});
	});
});

// ---- Probe tests 55-57 (Tests tab only; V probe 2.0.3): what can this helper do WITHOUT root? ----
// evdev {watchMs, launch}: reads the TV's key devices (/dev/input) read-only and counts the key events seen for watchMs
// (0 = only list the devices). With launch: the first Home key (codes 773, 774, 125) asks the TV to open Hearth
// (public applicationManager/launch) and the time that took is answered. Nothing is written, grabbed or kept; the
// service ends itself after a watch so no reader stays behind.
var fs = require('fs');
var HOME_CODES = [773, 774, 125];

function readText (path) { try { return String(fs.readFileSync(path)).replace(/\s+$/, ''); } catch (e) { return ''; } }

function listDevices () {
	var names, out = [], i, p, fd, d;
	try { names = fs.readdirSync('/dev/input'); } catch (e) { return {error: text(e), devices: []}; }
	names = names.filter(function (n) { return /^event\d+$/.test(n); }).sort(function (a, b) { return Number(a.slice(5)) - Number(b.slice(5)); });
	for (i = 0; i < names.length && i < 40; i++) {
		p = '/dev/input/' + names[i];
		d = {dev: names[i], name: readText('/sys/class/input/' + names[i] + '/device/name').slice(0, 40), readable: false};
		try { fd = fs.openSync(p, 'r'); fs.closeSync(fd); d.readable = true; } catch (e) { d.error = String(e && e.code ? e.code : 'error'); }
		out.push(d);
	}
	return {devices: out};
}

service.register('evdev', function (message) {
	var p = message.payload || {}, watchMs = Math.max(0, Math.min(Number(p.watchMs) || 0, 60000)), wantLaunch = !!p.launch;
	var info = listDevices(), res, pick = [], size = (process.arch === 'arm' || process.arch === 'ia32') ? 16 : 24;
	var events = {}, t0 = Date.now(), done = false, launched = null, fds = [];
	res = {returnValue: true, uid: typeof process.getuid === 'function' ? process.getuid() : -1, arch: process.arch, node: process.version, devices: info.devices};
	if (info.error) res.error = info.error;
	if (!watchMs) { message.respond(res); return; }
	info.devices.forEach(function (d) { if (d.readable && /rcu|remote|key|lge|premium|ir/i.test(d.name) && pick.length < 3) pick.push(d); });
	if (!pick.length) info.devices.forEach(function (d) { if (d.readable && pick.length < 2) pick.push(d); });
	res.watched = pick.map(function (d) { return d.dev + ' ' + d.name; });
	keeping(function (release) {
		function finish () {
			if (done) return;
			done = true;
			fds.forEach(function (f) { try { fs.closeSync(f); } catch (e) { /* ignore */ } });
			release();
			res.events = events;
			if (launched) res.launch = launched;
			res.watchedMs = Date.now() - t0;
			message.respond(res);
			setTimeout(function () { process.exit(0); }, 500);
		}
		function onKey (code, value) {
			var e = events[code] || (events[code] = {down: 0, up: 0, rep: 0, firstMs: -1}), at = Date.now() - t0;
			if (value === 1) { e.down++; if (e.firstMs < 0) e.firstMs = at; } else if (value === 0) e.up++; else e.rep++;
			if (wantLaunch && !launched && value === 1 && HOME_CODES.indexOf(code) >= 0) {
				launched = {code: code, pending: true};
				try {
					service.call('luna://com.webos.applicationManager/launch', {id: 'tld.my.customlauncher'}, function (m) {
						var pl = (m && m.payload) || {};
						launched = {code: code, ok: pl.returnValue === true, ms: Date.now() - t0 - at, error: pl.errorText ? String(pl.errorText).slice(0, 80) : undefined};
					});
				} catch (err) { launched = {code: code, ok: false, error: text(err)}; }
			}
		}
		pick.forEach(function (d) {
			fs.open('/dev/input/' + d.dev, 'r', function (err, fd) {
				var buf = mk(size);
				if (err) { res.error = text(err); return; }
				fds.push(fd);
				(function again () {
					if (done) return;
					fs.read(fd, buf, 0, size, null, function (e2, n) {
						if (e2 || n < size || done) return;
						if (buf.readUInt16LE(size - 8) === 1) onKey(buf.readUInt16LE(size - 6), buf.readInt32LE(size - 4));
						again();
					});
				}());
			});
		});
		setTimeout(finish, watchMs + (wantLaunch ? 1500 : 0));
	});
});
