/*
 * Hearth screen saver (experimental): a slideshow of the user's wallpaper photos, animated GIFs and videos.
 *
 * The TV's own screen saver app (com.webos.app.screensaver) loads this file instead of its own: screensaver.sh
 * bind-mounts it over the app's QML (memory only, nothing on the flash changes). The settings below and the list of
 * photos are filled in by screensaver.sh before it is mounted. The platform dismisses a screen saver on any key, so
 * nothing here handles keys.
 *
 * Black ground, slow cross-fade (the new picture fades in over the old one), pictures decoded no larger than 1920x1080. Optional Dim layer and OLED care frame for a single item.
 */
import QtQuick 2.5
import Eos.Window 0.1

WebOSWindow {
    id: win

    // Sized for the compositor's 1920x1080 layout rather than from Screen, which can report smaller.
    width: 1920
    height: 1080

    windowType: "_WEBOS_WINDOW_TYPE_SCREENSAVER"
    appId: "com.webos.app.screensaver"
    title: "Screen Saver"
    visible: true
    color: "black"

    // B2: an explicit opaque black base under everything. The window colour alone left the OLED care frame (and any bar) see-through
    // on the TV, so the app that was open (YouTube) showed there; this layer draws solid black pixels (alpha 255).
    Rectangle {
        z: -100
        x: 0
        y: 0
        width: 1920
        height: 1080
        color: "#ff000000"
    }

    property var photos: [
//@PHOTOS@
        ""
    ]
    property int intervalSec: __INTERVAL__
    property bool shuffle: __SHUFFLE__
    property bool dim: __DIM__
    // OLED care for a single item (picture, GIF or video): 0 off, 1 on
    property int careMode: __CARE__
    // picture size: 0 fit the whole picture (bars), 1 fill the screen (cropped); pictures, GIFs and videos
    property bool fill: __FILL__ === 1

    // OLED care (single item only): the picture is fitted inside a thin black frame and moves a few pixels about every
    // minute, so no pixel stays lit in one place. A slideshow has no frame and no drift.
    property int frame: 0
    property int driftStep: 0
    property bool driftAnimated: false
    function tri(t, n) {
        var m = t % (4 * n);
        if (m < n) return m;
        if (m < 3 * n) return 2 * n - m;
        return m - 4 * n;
    }
    // a 12 px frame (was 10 until 2.1.6 p1); steps of 2 px: +-8 px across, +-6 px down, so the picture never leaves the screen
    // p21 (TV test 68, user 2026-11-10): the TV's video plane does not follow a moving layer by itself. While the layer slides (3 s) the video item is
    // made 1 px wider and back every 0.1 s (`pulseLeft` counts the steps), which makes the plane read its rectangle again: the video stays inside the frame.
    property int pulseLeft: 0
    property int offX: frame > 0 ? frame + 2 * tri(driftStep, 4) : 0
    property int offY: frame > 0 ? frame + 2 * tri(driftStep, 3) : 0

    property var list: []
    property var order: []
    property int at: -1
    property bool frontIsA: false

    function prepare() {
        var l = [];
        for (var i = 0; i < photos.length; i++) if (photos[i] !== "") l.push(photos[i]);
        list = l;
        var o = [];
        for (var j = 0; j < l.length; j++) o.push(j);
        if (shuffle) {
            for (var k = o.length - 1; k > 0; k--) {
                var r = Math.floor(Math.random() * (k + 1));
                var t = o[k]; o[k] = o[r]; o[r] = t;
            }
            // and the session starts at a random point of the shuffled list
            var s0 = Math.floor(Math.random() * o.length);
            o = o.slice(s0).concat(o.slice(0, s0));
        } else if (o.length > 1) {
            // sequential, but not always starting at the same picture
            var s = Math.floor(Math.random() * o.length);
            o = o.slice(s).concat(o.slice(0, s));
        }
        order = o;
        // one item only (picture, GIF or video): the thin frame and the slow drift
        if (l.length === 1 && careMode > 0) {
            frame = 12;
            console.log("hearth-saver: care frame on, kind " + kindOf(l[0]));
        }
    }

    // B6: the video item IS the picture. Its size is the video's picture rectangle (Fit: the video's aspect inside the layer, from metaData.resolution,
    // 16:9 until known; Fill: the whole layer, cropped by the player), centred in the layer, fillMode Stretch for Fit (no letterbox inside the plane),
    // and the PunchThrough hole is exactly the item. Item, hole and picture are one rectangle, as in the case that was always clean (Fill, no care frame).
    // The bars of Fit are the opaque black base (B2) around it. This replaces the B3 hole sizing and the B5 24 px workaround.
    // The video is one pixel short of the layer's height (the TV needs it). The black veil fades out once, at the first start only.
    function videoQml(version, loop) {
        return 'import QtQuick 2.4; import QtMultimedia ' + version + '; import Eos.Items 0.1; import WebOS.Global 1.0; Video { id: v; fillMode: ' + (fill ? 'VideoOutput.PreserveAspectCrop' : 'VideoOutput.Stretch') + '; property bool crop: ' + (fill ? 'true' : 'false') + '; property real ar: (metaData.resolution && metaData.resolution.width > 0 && metaData.resolution.height > 0) ? metaData.resolution.width / metaData.resolution.height : 1.7778; property int ph: crop ? parent.height - 1 : Math.round(Math.min(parent.height - 1, parent.width / ar)); property int pw: crop ? parent.width : Math.round(Math.min(parent.width, ph * ar)); property int nd: 0; width: pw + nd; height: ph; x: Math.floor((parent.width - pw) / 2); y: Math.floor((parent.height - ph) / 2); volume: 0; autoPlay: true; ' + (loop ? 'loops: MediaPlayer.Infinite; ' : '') + 'onPlaying: { if (!hole.visible) { hole.visible = true; veilIn.running = true; } parent.vstatus(true, false, false); } onStatusChanged: parent.vstatus(false, status === MediaPlayer.EndOfMedia, status === MediaPlayer.InvalidMedia); onPaused: parent.vstatus(false, true, false); onErrorChanged: if (error !== 0) parent.vfail(errorString); PunchThrough { id: hole; visible: false; z: -1; x: 0; y: 0; width: v.width; height: v.height; Rectangle { id: veil; x: -v.x; y: -v.y; width: 1920; height: 1080; z: 1; color: "black"; OpacityAnimator { id: veilIn; target: veil; from: 1; to: 0; duration: 1500; running: false } } } }';
    }

    // A lone video loops by the player itself (QtMultimedia 5.8 or later: loops); older Qt: restarted from videoEnded().
    function makeVideo(parentLayer) {
        if (list.length === 1) {
            try { return Qt.createQmlObject(videoQml("5.8", true), parentLayer, "hearthVideo"); }
            catch (e) { console.log("hearth-saver: no player loop here: " + e); }
        }
        return Qt.createQmlObject(videoQml("5.6", false), parentLayer, "hearthVideo");
    }

    property int fails: 0
    property string note: ""

    function kindOf(url) {
        if (/\.gif$/i.test(url)) return "gif";
        if (/\.(mp4|m4v|mov|mkv|webm)$/i.test(url)) return "video";
        return "image";
    }

    function next() {
        if (list.length === 0) return;
        at = (at + 1) % order.length;
        var url = list[order[at]];
        var target = frontIsA ? layerB : layerA;
        var other = frontIsA ? layerA : layerB;
        // the incoming layer is set to 0 at once, then fades in over the old one (which stays solid underneath until the fade is done)
        target.fadeOut();
        target.z = 2;
        other.z = 1;
        target.show(url);
        frontIsA = !frontIsA;
        // a picture or GIF stays for the interval; a video plays to its end (see videoEnded)
        if (kindOf(url) === "video") slide.stop();
        else if (list.length > 1) slide.restart();
    }

    // A picture that cannot be read or a video that cannot be played is skipped (not forever: at most one round of failures).
    function failed() {
        fails++;
        if (list.length > 1 && fails <= list.length) next();
    }

    // A video has played to its end: on to the next item; a lone video starts again.
    function videoEnded() {
        if (list.length > 1) { next(); return; }
        var l = frontIsA ? layerA : layerB;
        l.over = false;
        if (l.vobj) { l.vobj.seek(0); l.vobj.play(); }
    }

    Component.onCompleted: {
        prepare();
        next();
    }

    // The drift: one small step about every minute (only while a frame is on).
    Timer {
        id: drift
        interval: __DRIFTMS__   // 60000 (Q5 test: 8000)
        repeat: true
        running: win.frame > 0
        onTriggered: {
            win.driftAnimated = true;
            win.driftStep = win.driftStep + 1;
            win.pulseLeft = 36;
        }
    }

    // p21: the front video item is made 1 px wider and back, so the TV's video plane reads its rectangle again (see driftStep above).
    Timer {
        id: pulse
        interval: 100
        repeat: true
        running: win.pulseLeft > 0
        onTriggered: {
            win.pulseLeft = win.pulseLeft - 1;
            var l = win.frontIsA ? layerA : layerB;
            if (l.vobj) l.vobj.nd = win.pulseLeft % 2;
        }
    }

    Timer {
        id: slide
        interval: win.intervalSec * 1000
        repeat: true
        onTriggered: win.next()
    }

    Item {
        id: layerA
        property bool pending: false
        property string kind: "image"
        property var vobj: null
        x: win.offX
        y: win.offY
        width: win.width - 2 * win.frame
        height: win.height - 2 * win.frame
        opacity: 0
        clip: true   // Fill crops inside the layer
        // the fade-in is an explicit animation (fade A or B), started when the item is ready; the layer is set to 0 at once before a new item
        NumberAnimation { id: fadeA; target: layerA; property: "opacity"; from: 0; to: 1; duration: 1500; easing.type: Easing.InOutQuad }
        function fadeOut() { fadeA.stop(); opacity = 0; }
        function appear() { fadeA.restart(); }
        Behavior on x { enabled: win.driftAnimated; NumberAnimation { duration: 3000 } }
        Behavior on y { enabled: win.driftAnimated; NumberAnimation { duration: 3000 } }
        function show(url) {
            pending = true;
            over = false;
            kind = win.kindOf(url);
            dropVideo();
            stillA.source = "";
            movieA.playing = false;
            movieA.source = "";
            if (kind === "gif") movieA.source = url;
            else if (kind === "video") startVideo(url);
            else stillA.source = url;
        }
        function dropVideo() { if (vobj) { vobj.stop(); vobj.destroy(); vobj = null; } }
        function clear() { stillA.source = ""; movieA.source = ""; dropVideo(); }
        // The video element is made only when a video is shown (and inside try): if the TV has no QtMultimedia, videos are skipped and nothing else is affected.
        function startVideo(url) {
            try {
                vobj = win.makeVideo(layerA);
                vobj.source = url;
            watchA.restart();
            } catch (e) { win.note = "video: " + e; vobj = null; pending = false; win.failed(); }
        }
        property bool over: false
        function vstatus(playing, ended, bad) {
            if (kind !== "video") return;
            if (playing && pending) { pending = false; win.fails = 0; appear(); clearOther.restart(); watchA.stop(); }
            else if (ended && !pending && !over) { over = true; win.videoEnded(); }
            else if (bad) vfail("invalid media");
        }
        function vfail(why) { if (kind === "video" && pending) { win.note = "video: " + why; pending = false; dropVideo(); win.failed(); } }
        function ready(status) {
            if (status === Image.Ready && pending) { pending = false; win.fails = 0; appear(); if (kind === "gif") movieA.playing = true; clearOther.restart(); }
            else if (status === Image.Error && pending) { pending = false; win.failed(); }
        }
        Timer {
            id: watchA
            interval: 10000
            onTriggered: if (layerA.pending && layerA.kind === "video") layerA.vfail("did not start in 10 s")
        }
        // black behind a picture or GIF, so the old picture cannot show through the bars of the new one while it fades in
        Rectangle { anchors.fill: parent; z: -1; color: "black"; visible: layerA.kind !== "video" }
        Image {
            id: stillA
            anchors.fill: parent
            fillMode: win.fill ? Image.PreserveAspectCrop : Image.PreserveAspectFit
            asynchronous: true
            autoTransform: true
            cache: false
            smooth: true
            sourceSize.width: 1920
            sourceSize.height: 1080
            onStatusChanged: if (layerA.kind === "image") layerA.ready(status)
        }
        AnimatedImage {
            id: movieA
            anchors.fill: parent
            fillMode: win.fill ? Image.PreserveAspectCrop : Image.PreserveAspectFit
            asynchronous: true
            cache: false
            playing: false
            onStatusChanged: if (layerA.kind === "gif") layerA.ready(status)
        }
    }

    Item {
        id: layerB
        property bool pending: false
        property string kind: "image"
        property var vobj: null
        x: win.offX
        y: win.offY
        width: win.width - 2 * win.frame
        height: win.height - 2 * win.frame
        opacity: 0
        clip: true   // Fill crops inside the layer
        // the fade-in is an explicit animation (fade A or B), started when the item is ready; the layer is set to 0 at once before a new item
        NumberAnimation { id: fadeB; target: layerB; property: "opacity"; from: 0; to: 1; duration: 1500; easing.type: Easing.InOutQuad }
        function fadeOut() { fadeB.stop(); opacity = 0; }
        function appear() { fadeB.restart(); }
        Behavior on x { enabled: win.driftAnimated; NumberAnimation { duration: 3000 } }
        Behavior on y { enabled: win.driftAnimated; NumberAnimation { duration: 3000 } }
        function show(url) {
            pending = true;
            over = false;
            kind = win.kindOf(url);
            dropVideo();
            stillB.source = "";
            movieB.playing = false;
            movieB.source = "";
            if (kind === "gif") movieB.source = url;
            else if (kind === "video") startVideo(url);
            else stillB.source = url;
        }
        function dropVideo() { if (vobj) { vobj.stop(); vobj.destroy(); vobj = null; } }
        function clear() { stillB.source = ""; movieB.source = ""; dropVideo(); }
        // The video element is made only when a video is shown (and inside try): if the TV has no QtMultimedia, videos are skipped and nothing else is affected.
        function startVideo(url) {
            try {
                vobj = win.makeVideo(layerB);
                vobj.source = url;
            watchB.restart();
            } catch (e) { win.note = "video: " + e; vobj = null; pending = false; win.failed(); }
        }
        property bool over: false
        function vstatus(playing, ended, bad) {
            if (kind !== "video") return;
            if (playing && pending) { pending = false; win.fails = 0; appear(); clearOther.restart(); watchB.stop(); }
            else if (ended && !pending && !over) { over = true; win.videoEnded(); }
            else if (bad) vfail("invalid media");
        }
        function vfail(why) { if (kind === "video" && pending) { win.note = "video: " + why; pending = false; dropVideo(); win.failed(); } }
        function ready(status) {
            if (status === Image.Ready && pending) { pending = false; win.fails = 0; appear(); if (kind === "gif") movieB.playing = true; clearOther.restart(); }
            else if (status === Image.Error && pending) { pending = false; win.failed(); }
        }
        Timer {
            id: watchB
            interval: 10000
            onTriggered: if (layerB.pending && layerB.kind === "video") layerB.vfail("did not start in 10 s")
        }
        // black behind a picture or GIF, so the old picture cannot show through the bars of the new one while it fades in
        Rectangle { anchors.fill: parent; z: -1; color: "black"; visible: layerB.kind !== "video" }
        Image {
            id: stillB
            anchors.fill: parent
            fillMode: win.fill ? Image.PreserveAspectCrop : Image.PreserveAspectFit
            asynchronous: true
            autoTransform: true
            cache: false
            smooth: true
            sourceSize.width: 1920
            sourceSize.height: 1080
            onStatusChanged: if (layerB.kind === "image") layerB.ready(status)
        }
        AnimatedImage {
            id: movieB
            anchors.fill: parent
            fillMode: win.fill ? Image.PreserveAspectCrop : Image.PreserveAspectFit
            asynchronous: true
            cache: false
            playing: false
            onStatusChanged: if (layerB.kind === "gif") layerB.ready(status)
        }
    }

    // After the cross-fade the picture underneath is not needed: stop it and free its memory.
    Timer {
        id: clearOther
        interval: 2000
        onTriggered: (win.frontIsA ? layerB : layerA).clear()
    }

    // Dim: a black layer over the picture (dimlevel % opacity, 40 = about 60% brightness). It dims what is drawn, not the TV's backlight;
    // whether it also dims a video (drawn on the TV's video plane) is not known yet.
    Rectangle {
        z: 10
        anchors.fill: parent
        color: "black"
        opacity: __DIMLEVEL__ / 100
        visible: win.dim
    }

    // Q6 probe overlay (Tests tab 49-53 only; overlay=0 in normal use, then nothing below is created). It does not depend on the picture:
    // an info panel with the live numbers, a RED box on the picture layer (moves with the drift), a GREEN box on the video item,
    // and a MAGENTA line on each of the four screen edges. Where the picture's edge differs from the boxes, or a magenta line is
    // missing, the stripe is found.
    property bool overlay: __OVERLAY__ === 1
    Loader { z: 30; active: win.overlay; sourceComponent: probeOverlay }
    Component {
        id: probeOverlay
        Item {
            id: po
            width: 1920
            height: 1080
            property var front: win.frontIsA ? layerA : layerB
            property int up: 0
            property int lx: 0
            property int ly: 0
            property int lw: 0
            property int lh: 0
            property int vx: 0
            property int vy: 0
            property int vw: 0
            property int vh: 0
            property bool hasVideo: false
            property int seen: -1
            property int ago: 0
            function sample() {
                var f = po.front;
                if (!f) return;
                lx = f.x; ly = f.y; lw = f.width; lh = f.height;
                var v = f.vobj;
                if (v) { hasVideo = true; vx = f.x + v.x; vy = f.y + v.y; vw = v.width; vh = v.height; }
                else hasVideo = false;
            }
            Timer { interval: 250; repeat: true; running: true; triggeredOnStart: true; onTriggered: po.sample() }
            Timer { interval: 1000; repeat: true; running: true; onTriggered: { po.up = po.up + 1; if (win.driftStep !== po.seen) { po.seen = win.driftStep; po.ago = 0; } else po.ago = po.ago + 1; } }
            // the four screen edges
            Rectangle { x: 0; y: 0; width: 1920; height: 3; color: "#ff00ff" }
            Rectangle { x: 0; y: 1077; width: 1920; height: 3; color: "#ff00ff" }
            Rectangle { x: 0; y: 0; width: 3; height: 1080; color: "#ff00ff" }
            Rectangle { x: 1917; y: 0; width: 3; height: 1080; color: "#ff00ff" }
            // the picture layer (red), drawn inside its edge
            Rectangle { x: po.lx; y: po.ly; width: po.lw; height: 4; color: "#ff0000" }
            Rectangle { x: po.lx; y: po.ly + po.lh - 4; width: po.lw; height: 4; color: "#ff0000" }
            Rectangle { x: po.lx; y: po.ly; width: 4; height: po.lh; color: "#ff0000" }
            Rectangle { x: po.lx + po.lw - 4; y: po.ly; width: 4; height: po.lh; color: "#ff0000" }
            // the video item (green), 6 px inside its edge
            Item {
                visible: po.hasVideo
                Rectangle { x: po.vx + 6; y: po.vy + 6; width: po.vw - 12; height: 4; color: "#00ff00" }
                Rectangle { x: po.vx + 6; y: po.vy + po.vh - 10; width: po.vw - 12; height: 4; color: "#00ff00" }
                Rectangle { x: po.vx + 6; y: po.vy + 6; width: 4; height: po.vh - 12; color: "#00ff00" }
                Rectangle { x: po.vx + po.vw - 10; y: po.vy + 6; width: 4; height: po.vh - 12; color: "#00ff00" }
            }
            Rectangle {
                x: 60
                y: 60
                width: 1200
                height: info.height + 24
                color: "#d9000000"
                Text {
                    id: info
                    x: 16
                    y: 12
                    color: "white"
                    font.pixelSize: 26
                    text: "HEARTH SAVER PROBE (Q6)   up " + po.up + " s\n"
                        + "kind " + (po.front ? po.front.kind : "-") + "   size " + (win.fill ? "Fill" : "Fit") + "   care " + (win.careMode > 0 ? "on" : "off") + "   frame " + win.frame + " px\n"
                        + "drift step " + win.driftStep + " (" + po.ago + " s ago)   every " + (drift.interval / 1000) + " s   (red box moves)\n"
                        + "RED box = picture layer   x " + po.lx + "  y " + po.ly + "   " + po.lw + " x " + po.lh + "\n"
                        + (po.hasVideo ? "GREEN box = video item   x " + po.vx + "  y " + po.vy + "   " + po.vw + " x " + po.vh : "no video item (picture or GIF)") + "\n"
                        + "MAGENTA line = each of the four screen edges   window " + win.width + " x " + win.height
                }
            }
        }
    }

    // A video problem is shown for a while in a corner (for reports); nothing else is ever drawn over the pictures.
    Text {
        z: 20
        x: 40
        y: 1020
        visible: win.note !== ""
        text: win.note
        color: "white"
        opacity: 0.6
        font.pixelSize: 24
        onTextChanged: noteOff.restart()
    }
    Timer { id: noteOff; interval: 20000; onTriggered: win.note = "" }
}
