import { USER_MESSAGES } from "../lang/message/en/user.js";

const NUM_BUTTON_MIN = 3;
const NUM_BUTTON_MAX = 7;
const DECIMAL_INPUT_CONVERTOR = 10;
const GAME_START_LOADING_TIME = 1000;
const PAUSE_INTERVAL_TIME = 2000;

const CLS_BOX = "box";
const CLS_LABEL = "label";
const CLS_LOCKED = "is-locked";

class Label {
    constructor(text, visible = true) {
        this.text = text;
        this.visible = visible;
        this.el = document.createElement('span');
        this.el.className = CLS_LABEL;
        this.sync();
    }

    sync() { this.el.textContent = this.visible ? String(this.text) : ""; }
    show() { this.visible = true; this.sync(); }
    hide() { this.visible = false; this.sync(); }
}

class Button {
    constructor(id, label) {
        this.id = id;
        this.label = label; 
        this.colorClass = Button.takeColor();

        this.el = document.createElement('button');
        this.el.className = `${CLS_BOX} ${this.colorClass}`;
        this.el.dataset.id = String(id);
        this.el.appendChild(this.label.el);

        this.locked = false;
        this._revealGuard = null;

        //  ensure the pressed card is on top when overlapping
        this.el.addEventListener("mousedown", () => {
            Button._z = (Button._z || 1) + 1;
            this.el.style.zIndex = String(Button._z);
        });

        this.el.addEventListener("click", () => {
            if (this.locked) return;
            // Ask container if this click is OK
            if (this._revealGuard && this._revealGuard(this) === false) return;
            // container handled (either revealed all or prevented)
            if (!this.label.visible) this.label.show(); 
            // default reveal-once
        });
    }

    static colors = ["color-1", "color-2", "color-3", "color-4", "color-5", "color-6", "color-7"];
    static colorPool = [];
    static resetColorPool() { Button.colorPool = [...Button.colors]; }
    static takeColor() {
        const i = Math.floor(Math.random() * Button.colorPool.length);
        const picked = Button.colorPool[i];
        const last = Button.colorPool.length - 1;
        Button.colorPool[i] = Button.colorPool[last];
        Button.colorPool.pop();
        return picked;
    }

    getLabelColorPair() {
        return {
            id: this.id,                
            label: this.label.text,       
            color: this.colorClass      
        };
    }

    setRevealGuard(fn) { this._revealGuard = (typeof fn === "function") ? fn : null; }
    clearRevealGuard() { this._revealGuard = null; }

    hideLabel() { this.label.hide(); }
    showLabel() { this.label.show(); }
    lock() { this.locked = true; this.el.classList.add(CLS_LOCKED); }
    unlock() { this.locked = false; this.el.classList.remove(CLS_LOCKED); }
}

class Container {
    constructor(numInput, promptLabel, renderPoint) {
        this.numInput = numInput;
        this.promptLabel = promptLabel;
        this.renderPoint = renderPoint;

        this.buttons = [];           
        this.labels = [];            
        this.answerKey = [];
        this._nextExpected = 0;
        this.goBtn = document.getElementById("goBtn");
    }

    static sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

    start = async () => {
        const numButton = parseInt(this.numInput.value, DECIMAL_INPUT_CONVERTOR);

        if (Number.isNaN(numButton) || numButton > NUM_BUTTON_MAX || numButton < NUM_BUTTON_MIN) {
            alert(t("RANGE", { min: NUM_BUTTON_MIN, max: NUM_BUTTON_MAX }));
            return;
        }

        this.setGoLocked(true);
        try {
            this.build(numButton);
            this.render();

            this.saveLabelColorPairs()

            // make the board a bounded arena that fits the window
            const rp = this.renderPoint;
            rp.style.position = "relative";
            rp.style.overflow = "hidden";

            this.lockAll()

            // pause n seconds
            await Container.sleep(numButton * GAME_START_LOADING_TIME);

            // freeze at current spots 
            this.anchorButtonsToCurrentLayout();

            // scramble n times, every 2s
            await this.scrambleNTimes(numButton, PAUSE_INTERVAL_TIME);

            // enter memory phase: hide numbers, allow reveal-once
            this.interactWithUser();
        } catch (e) {
            console.error(e);
            this.setGoLocked(false);
        }
    }

    saveLabelColorPairs() {
        this.answerKey = this.buttons.map(b => ({
            id: b.id,
            label: b.label.text,
            color: b.colorClass
        }));
        this._nextExpected = 0;
    }

    // Move every button to a new random valid spot once
    scrambleOnce() {
        const rp = this.renderPoint;
        this.buttons.forEach(b => this._placeInside(rp, b.el));
    }

    // Scramble `times` times with `intervalMs` pauses between moves
    async scrambleNTimes(times, intervalMs = 2000) {
        for (let k = 0; k < times; k++) {
            this.scrambleOnce();
            if (k < times - 1) await Container.sleep(intervalMs);
        }
    }

    // Freeze each button at its current on-screen position, then switch to absolute
    anchorButtonsToCurrentLayout() {
        const cRect = this.renderPoint.getBoundingClientRect();
        this.buttons.forEach(btn => {
            const r = btn.el.getBoundingClientRect();
            const left = r.left - cRect.left + this.renderPoint.scrollLeft;
            const top = r.top - cRect.top + this.renderPoint.scrollTop;

            // lock size so switching to absolute doesn't reflow
            btn.el.style.width = `${r.width}px`;
            btn.el.style.height = `${r.height}px`;

            btn.el.style.position = "absolute";
            btn.el.style.left = `${left}px`;
            btn.el.style.top = `${top}px`;
        });
    }

    build(numButton) {
        this.buttons = [];
        this.labels = [];

        Button.resetColorPool(); // reset before build the new one

        for (let i = 1; i <= numButton; i++) {
            const label = new Label(i, true);     
            const btn = new Button(i, label);   
            this.labels.push(label);
            this.buttons.push(btn);
        }
    }

    render() {
        this.renderPoint.innerHTML = "";
        this.buttons.forEach(btn => this.renderPoint.appendChild(btn.el));
    }

    _placeInside(container, el) {
        // Button size (current)
        const { width: bw, height: bh } = el.getBoundingClientRect();

        // Viewport size (current)
        const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

        // Pick a random target position INSIDE the viewport (keep button fully visible)
        const vLeft = Math.floor(Math.random() * Math.max(0, vw - bw + 1));
        const vTop = Math.floor(Math.random() * Math.max(0, vh - bh + 1));

        // Convert viewport coords -> container coords
        const cRect = container.getBoundingClientRect();
        let left = vLeft - cRect.left + container.scrollLeft;
        let top = vTop - cRect.top + container.scrollTop;

        // Also clamp to container bounds so it doesn't get clipped by the board
        const maxLeft = Math.max(0, container.clientWidth - bw);
        const maxTop = Math.max(0, container.clientHeight - bh);
        left = Math.min(Math.max(0, left), maxLeft);
        top = Math.min(Math.max(0, top), maxTop);

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    interactWithUser() {
        // Start hidden; clicks will reveal in order only
        this._nextExpected = 0;

        // guard function (closed over container state)
        const guard = (btn) => {
            // If already revealed, ignore the click
            if (btn.label.visible) return false;

            const expected = this.answerKey[this._nextExpected];
            if (!expected) return false; // nothing expected; likely finished

            // Correct button - match by id
            if (btn.id === expected.id) {
                btn.showLabel();  // reveal now
                btn.lock();       // prevent further clicks on this button
                this._nextExpected += 1;

                // Finished successfully
                if (this._nextExpected >= this.answerKey.length) {
                    this.buttons.forEach(b => b.clearRevealGuard());
                    this.onWin();
                }
                return false;  // we handled reveal ourselves
            }
            this.onFail();
            return false;
        };
        // Hide, unlock, and attach guard to each button
        this.buttons.forEach(b => {
            b.hideLabel();
            b.unlock();
            b.setRevealGuard(guard);
        });
    }

    onWin() {
        alert(USER_MESSAGES.EXCELLENT);
        this.lockAll();
        this.buttons.forEach(b => b.clearRevealGuard());
        this.setGoLocked(false);
    }

    onFail() {
        alert(USER_MESSAGES.WRONG);
        this.revealAllLabels();
        this.lockAll();
        this.buttons.forEach(b => b.clearRevealGuard());
        this.setGoLocked(false);
    }

    setGoLocked(locked) {
        if (!this.goBtn) return;
        this.goBtn.disabled = locked;
        this.goBtn.classList.toggle(CLS_LOCKED, locked);
    }

    revealAllLabels() { this.buttons.forEach(b => b.showLabel()); }
    lockAll() { this.buttons.forEach(b => b.lock()); }
    unlockAll() { this.buttons.forEach(b => b.unlock()); }
}

document.addEventListener("DOMContentLoaded", () => {
    const numInput = document.getElementById("userInput");
    const promptLabel = document.getElementById("promptLabel");
    const board = document.getElementById("board");
    const goBtn = document.getElementById("goBtn");

    const container = new Container(numInput, promptLabel, board);

    goBtn.addEventListener("click", () => {
        if (goBtn.disabled) return;
        container.start();
    });
});
