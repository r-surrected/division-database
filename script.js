let currentProfileUserId = null;

// Global state
let ccaState = {};   // userId -> info for CCA branch
let otaState = {};   // userId -> info for OTA branch
let ccaEvents = [];  // list of CCA events
let otaEvents = [];  // list of OTA events
let usernameHistory = {}; // userId -> [names]
let loaded = false;
let currentMode = "CCA"; // "CCA" or "OTA"

// Divisions and variants (plus COMMAND)
const CCA_DIVISIONS = ["JURY", "SPEAR", "RAZOR", "ACADEMY", "COMMAND"];
const OTA_VARIANTS = ["ECHO", "RANGER", "DAGGER", "PHANTOM", "KING", "COMMAND"];


console.log("DEBUG CCA events:", ccaEvents.length);
console.log("DEBUG OTA events:", otaEvents.length);

// Rank ordering for division view (high to low)
const CCA_RANK_ORDER = [
    "Division Leader",
    "Head Instructor",
    "Squadron Leader",
    "Deputy Instructor",
    "Field Officer",
    "Senior Instructor",
    "Elite Protection Unit",
    "D1 Protection Unit",
    "D2 Protection Unit",
    "D3 Protection Unit",
    "D4 Protection Unit",
    "D5 Protection Unit",
    "Recruit"
];

const OTA_TIER_ORDER = [
    "Tier I",
    "Tier II",
    "Tier III"
];

// Command ordering for CCA
const CCA_COMMAND_ORDER = [
    "Earth Administrator",
    "Sectorial Commander",
    "Field Commander",
    "Adjutant Commander",
    "Division Leader",
    "Squadron Leader",
    "Field Officer",
    "Elite Protection Unit"
];

// Command ordering for OTA
const OTA_COMMAND_ORDER = [
    "Earth Administrator",
    "Sectorial Commander",
    "Overwatch Commander",
    "Overwatch Captain",
    "Overwatch Officer",
    "Overwatch Leader"
];

// High command ranks that are not in divisions conceptually
const CCA_HIGH_COMMAND_RANKS = new Set([
    "Adjutant Commander",
    "Field Commander",
    "Sectorial Commander",
    "Earth Administrator"
]);

// OA rank aliasing for command view
const OA_ALIAS_MAP = {
    "Senior Instructor": "OfC",
    "Deputy Instructor": "SqL",
    "Head Instructor": "DvL"
};

// Utility to load JSON
async function loadJSON(path) {
    console.log("DEBUG fetch:", path); // debug
    const res = await fetch(path, { cache: "no-store" }); // important fix
    if (!res.ok) {
        throw new Error("Failed to load " + path);
    }
    return res.json();
}

function getEventUsername(ev) {
    return (
        ev.new_username ||
        ev.newUsername ||
        ev.username ||
        ev.old_username ||
        "Unknown"
    );
}



function getLatestUsername(userId, fallback) {
    const hist = usernameHistory[userId];
    if (hist && hist.length > 0) {
        return hist[hist.length - 1]; // last = newest
    }
    return fallback;
}


// This function is auto updated by checker.py
async function getLogFileList() {
    console.log("DEBUG getLogFileList CALLED");
    return [
        "2025_12.json",
        "2026_01.json"
    ];
}


// Apply event to state like backend
function applyEventToState(state, event) {
    const uid = String(event.user_id);
    const type = event.type;

    if (type === "enlistment") {
        state[uid] = {
            username: event.username,
            division: event.division,
            role_id: event.role_id,
            rank_name: event.rank_name,
            rank_value: event.rank_value
        };
    } else if (type === "discharge") {
        delete state[uid];
    } else if (type === "promotion" || type === "demotion" || type === "rank_change") {
        if (state[uid]) {
            state[uid].rank_name = event.new_rank_name;
            state[uid].rank_value = event.new_rank_value;
            if (event.new_role_id) {
                state[uid].role_id = event.new_role_id;
            }
        }
    } else if (type === "division_transfer") {
        if (!state[uid]) return;

        // Prevent CCA transfers from corrupting Academy members
        if (event.branch === "CCA" && state[uid].division === "ACADEMY") {
            return;
        }

        state[uid].division = event.new_division;
    }
    else if (type === "username_change") {
        if (state[uid]) {
            state[uid].username = event.new_username;
        }
    }
}

// Load data for both branches
async function loadData() {
    if (loaded) return;

    // 1. Load CCA base snapshot (jury, spear, razor, academy)
    let ccaBase = {};
    const baseCCAFiles = ["jury", "spear", "razor", "academy"];
    for (const div of baseCCAFiles) {
        try {
            const baseData = await loadJSON(`data/base/${div}.json`);
            for (const [uid, info] of Object.entries(baseData)) {
                ccaBase[uid] = { ...info };
            }
        } catch (err) {
            console.warn("Failed to load base for", div, err);
        }
    }

    // 2. Load OTA base snapshot
    let otaBase = {};
    try {
        const baseOTA = await loadJSON("data/base/ota.json");
        for (const [uid, info] of Object.entries(baseOTA)) {
            otaBase[uid] = { ...info };
        }
    } catch (err) {
        console.warn("Failed to load OTA base:", err);
    }

    // 3. Load logs
    let allEvents = [];
    let logFiles = [];
    try {
        logFiles = await getLogFileList();
    } catch (err) {
        console.warn("getLogFileList failed:", err);
    }

    for (const file of logFiles) {
        const path = `data/logs/${file}`;
        console.log("DEBUG attempt load log:", path);
        try {
            const log = await loadJSON(path);
            console.log("DEBUG loaded", log.length, "events from", file);
            allEvents.push(...log);
        } catch (err) {
            console.warn("Failed to load log file", file, err);
        }
    }


    // Sort by date ascending
    allEvents.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return 0;
    });

    // 4. Split into branches
    ccaEvents = [];
    otaEvents = [];

    for (const ev of allEvents) {
        const branch = ev.branch || "CCA";
        if (branch === "OTA") {
            otaEvents.push(ev);
        } else {
            ccaEvents.push(ev);
        }
    }

    // 5. Build states
    let stateCCA = { ...ccaBase };
    for (const ev of ccaEvents) {
        applyEventToState(stateCCA, ev);
    }

    let stateOTA = { ...otaBase };
    for (const ev of otaEvents) {
        applyEventToState(stateOTA, ev);
    }

    ccaState = stateCCA;
    otaState = stateOTA;

    // 6. Load username history
    try {
        const hist = await loadJSON("data/usernames.json");
        if (hist && typeof hist === "object") {
            usernameHistory = hist;
        }
    } catch (err) {
        console.warn("No username history file yet, or failed to load:", err);
        usernameHistory = {};
    }

    loaded = true;
}

// Helpers to get current branch data

function getCurrentState() {
    return currentMode === "CCA" ? ccaState : otaState;
}

function getCurrentEvents() {
    return currentMode === "CCA" ? ccaEvents : otaEvents;
}

// UI Navigation

function setActiveView(viewName) {
    document.querySelectorAll(".nav-button").forEach(btn => {
        const view = btn.dataset.view;
        if (view === viewName) {
            btn.classList.add("active");
        } else if (!btn.classList.contains("back-button")) {
            btn.classList.remove("active");
        }
    });

    document.querySelectorAll("#panels .panel").forEach(panel => {
        if (panel.id === `view-${viewName}`) {
            panel.classList.add("visible");
        } else if (!panel.classList.contains("profile-panel")) {
            panel.classList.remove("visible");
        }
    });

    hideProfile();

    if (viewName === "divisions") {
        const activeDivBtn = document.querySelector(".division-button.active");
        if (activeDivBtn && activeDivBtn.dataset.division) {
            renderDivision(activeDivBtn.dataset.division);
        }
    } else if (viewName === "timeline") {
        renderTimeline();
    }
}

// Mode switching

function setupModeUI() {
    const modeButton = document.getElementById("mode-toggle");
    const subtitle = document.getElementById("mode-subtitle");
    const divisionsTitle = document.getElementById("divisions-title");
    const divisionsDesc = document.getElementById("divisions-desc");
    const logo = document.getElementById("mode-logo");


    if (currentMode === "CCA") {
        document.body.classList.remove("mode-ota");
        modeButton.textContent = "Mode: CCA";
        subtitle.textContent = "Mode: Civil Protection and Officer Academy";
        divisionsTitle.textContent = "Divisions";
        divisionsDesc.textContent = "Select a division or command to view current members by rank.";

        logo.src = "icons/CCA.webp";

        setupDivisionButtonsCCA();
    } else {
        document.body.classList.add("mode-ota");
        modeButton.textContent = "Mode: OTA";
        subtitle.textContent = "Mode: Overwatch Transhuman Arm";
        divisionsTitle.textContent = "Variants";
        divisionsDesc.textContent = "Select a variant or command to view units by tier.";

        logo.src = "icons/OTA.webp";

        setupDivisionButtonsOTA();
    }

    const activeViewBtn = document.querySelector(".nav-button.active");
    const activeView = activeViewBtn ? activeViewBtn.dataset.view : "divisions";
    setActiveView(activeView || "divisions");
}

function toggleMode() {
    currentMode = currentMode === "CCA" ? "OTA" : "CCA";
    setupModeUI();
}

// Setup division buttons for CCA

function setupDivisionButtonsCCA() {
    const buttons = document.querySelectorAll(".division-button");
    buttons.forEach((btn, idx) => {
        if (idx < CCA_DIVISIONS.length) {
            const divName = CCA_DIVISIONS[idx];
            btn.style.display = "inline-block";
            btn.textContent = divName;
            btn.dataset.division = divName;
        } else {
            btn.style.display = "none";
            btn.dataset.division = "";
            btn.textContent = "";
        }
        btn.classList.remove("active");
    });
    const first = Array.from(buttons).find(b => b.dataset.division === "JURY");
    if (first) {
        first.classList.add("active");
        renderDivision("JURY");
    }
}

// Setup division buttons for OTA variants

function setupDivisionButtonsOTA() {
    const buttons = document.querySelectorAll(".division-button");
    buttons.forEach((btn, idx) => {
        if (idx < OTA_VARIANTS.length) {
            const variant = OTA_VARIANTS[idx];
            btn.style.display = "inline-block";
            btn.textContent = variant;
            btn.dataset.division = variant;
        } else {
            btn.style.display = "none";
            btn.dataset.division = "";
            btn.textContent = "";
        }
        btn.classList.remove("active");
    });
    const first = Array.from(buttons).find(b => b.dataset.division === "ECHO");
    if (first) {
        first.classList.add("active");
        renderDivision("ECHO");
    }
}

// Division / Variant / Command rendering

function renderDivision(divisionName) {
    const container = document.getElementById("division-content");
    container.innerHTML = "";

    if (divisionName === "COMMAND") {
        renderCommandDivision(container);
        return;
    }

    const state = getCurrentState();
    const members = Object.entries(state)
        .filter(([, info]) => info.division === divisionName);

    if (members.length === 0) {
        container.innerHTML = `<div class="info-text">No members found in ${divisionName}.</div>`;
        return;
    }

    // Group by rank
    const rankMap = {};
    for (const [uid, info] of members) {
        const rankName = info.rank_name;
        if (!rankMap[rankName]) {
            rankMap[rankName] = [];
        }
        rankMap[rankName].push({ userId: uid, username: info.username });
    }

    for (const [rank, userList] of Object.entries(rankMap)) {
        userList.sort((a, b) =>
            (a.username || "").localeCompare(b.username || "")
        );
    }

    let orderedRanks;
    if (currentMode === "CCA") {
        orderedRanks = CCA_RANK_ORDER.filter(r => rankMap[r]);
    } else {
        orderedRanks = OTA_TIER_ORDER.filter(r => rankMap[r]);
    }

    for (const rankName of orderedRanks) {
        const userList = rankMap[rankName];
        if (!userList) continue;

        const block = document.createElement("div");
        block.className = "rank-block";

        const header = document.createElement("div");
        header.className = "rank-header";
        header.textContent = rankName;
        block.appendChild(header);

        const body = document.createElement("div");
        body.className = "rank-members";

        for (const user of userList) {
            const entry = document.createElement("div");
            entry.className = "member-entry";
            entry.textContent = getLatestUsername(user.userId, user.username);
            entry.dataset.userId = user.userId;
            entry.addEventListener("click", () => {
                showProfile(user.userId);
            });
            body.appendChild(entry);
        }

        block.appendChild(body);
        container.appendChild(block);
    }
}

// Command rendering inside Divisions view

function renderCommandDivision(container) {
    const state = getCurrentState();
    container.innerHTML = "";

    if (currentMode === "CCA") {

        const rankGroups = {};

        for (const [uid, info] of Object.entries(state)) {

            let rank = info.rank_name;
            let effectiveRank = rank;

            // OA STAFF ARE COMMAND – map their rank
            if (rank === "Senior Instructor") {
                effectiveRank = "Field Officer";
            }
            else if (rank === "Deputy Instructor") {
                effectiveRank = "Squadron Leader";
            }
            else if (rank === "Head Instructor") {
                effectiveRank = "Division Leader";
            }

            // Only include command ranks
            if (!CCA_COMMAND_ORDER.includes(effectiveRank)) continue;

            if (!rankGroups[effectiveRank]) {
                rankGroups[effectiveRank] = [];
            }

            const uname = getLatestUsername(uid, info.username);

            if (CCA_HIGH_COMMAND_RANKS.has(rank)) {
                rankGroups[effectiveRank].push({
                    userId: uid,
                    label: `${uname}`
                });
            } else {
                rankGroups[effectiveRank].push({
                    userId: uid,
                    label: `${uname} (${info.division})`
                });
            }

        }

        // If no command units exist
        if (Object.keys(rankGroups).length === 0) {
            container.innerHTML = `<div class="info-text">No command units found.</div>`;
            return;
        }

        // Render command blocks in correct order
        for (const rank of CCA_COMMAND_ORDER) {
            const list = rankGroups[rank];
            if (!list) continue;

            list.sort((a, b) => a.label.localeCompare(b.label));

            const block = document.createElement("div");
            block.className = "rank-block";

            const header = document.createElement("div");
            header.className = "rank-header";
            header.textContent = rank;
            block.appendChild(header);

            const body = document.createElement("div");
            body.className = "rank-members";

            for (const u of list) {
                const entry = document.createElement("div");
                entry.className = "member-entry";
                entry.textContent = u.label;

                entry.dataset.userId = u.userId;
                entry.addEventListener("click", () => showProfile(u.userId));
                body.appendChild(entry);
            }

            block.appendChild(body);
            container.appendChild(block);
        }

        return;
    }

    // -------- OTA Command (unchanged) --------

    const rankGroups = {};
    for (const [uid, info] of Object.entries(state)) {
        const rank = info.rank_name;
        if (!OTA_COMMAND_ORDER.includes(rank)) continue;

        if (!rankGroups[rank]) rankGroups[rank] = [];
        rankGroups[rank].push({
            userId: uid,
            username: info.username
        });
    }

    for (const rank of OTA_COMMAND_ORDER) {
        const list = rankGroups[rank];
        if (!list) continue;

        const block = document.createElement("div");
        block.className = "rank-block";

        const header = document.createElement("div");
        header.className = "rank-header";
        header.textContent = rank;
        block.appendChild(header);

        const body = document.createElement("div");
        body.className = "rank-members";

        for (const u of list) {
            const entry = document.createElement("div");
            entry.className = "member-entry";
            entry.textContent = getLatestUsername(u.userId, u.username);

            entry.dataset.userId = u.userId;
            entry.addEventListener("click", () => showProfile(u.userId));
            body.appendChild(entry);
        }

        block.appendChild(body);
        container.appendChild(block);
    }
}





// Search

function runSearch() {
    const input = document.getElementById("search-input");
    const term = input.value.trim().toLowerCase();
    const resultsContainer = document.getElementById("search-results");
    resultsContainer.innerHTML = "";

    if (!term) {
        resultsContainer.innerHTML = `<div class="info-text">Enter a username to search.</div>`;
        return;
    }

    const state = getCurrentState();
    const matches = Object.entries(state)
        .filter(([, info]) => info.username.toLowerCase().includes(term))
        .map(([uid, info]) => ({ userId: uid, ...info }));

    if (matches.length === 0) {
        resultsContainer.innerHTML = `<div class="info-text">No users found matching "${term}".</div>`;
        return;
    }

    for (const user of matches) {
        const row = document.createElement("div");
        row.className = "member-entry";
        const uname = getLatestUsername(user.userId, user.username);
        row.textContent = `${uname} - ${user.division} - ${user.rank_name}`;

        row.dataset.userId = user.userId;
        row.addEventListener("click", () => {
            showProfile(user.userId);
        });
        resultsContainer.appendChild(row);
    }
}

// Timeline

function renderTimeline() {
    const list = document.getElementById("timeline-list");
    const search = document.getElementById("timeline-search").value.trim().toLowerCase();

    list.innerHTML = "";

    let events = getCurrentEvents();
    events = [...events].reverse();

    if (search) {
        const s = search.toLowerCase();
        events = events.filter(ev => {
            return (
                (ev.username && ev.username.toLowerCase().includes(s)) ||
                (ev.old_username && ev.old_username.toLowerCase().includes(s)) ||
                (ev.new_username && ev.new_username.toLowerCase().includes(s))
            );
        });
    }




    if (events.length === 0) {
        list.innerHTML = `<div class="info-text">No events found for this branch.</div>`;
        return;
    }

    for (const ev of events) {
        const line = document.createElement("div");
        line.className = "timeline-entry";
        const uname = getEventUsername(ev);



        let text = `[${ev.date}] ${ev.type} - ${getEventUsername(ev)}`;


        if (ev.type === "enlistment") {
            text += ` joined ${ev.division} as ${ev.rank_name}`;
        } else if (ev.type === "discharge") {
            text += ` left ${ev.division} (${ev.old_rank_name})`;
        } else if (ev.type === "promotion") {
            text += ` in ${ev.division}: ${ev.old_rank_name} -> ${ev.new_rank_name}`;
        } else if (ev.type === "demotion") {
            text += ` in ${ev.division}: ${ev.old_rank_name} -> ${ev.new_rank_name}`;
        } else if (ev.type === "division_transfer") {
            text += ` moved ${ev.old_division} -> ${ev.new_division} (${ev.rank_name})`;
        } else if (ev.type === "username_change") {
            text += ` changed username from ${ev.old_username} to ${ev.new_username}`;
        }

        line.textContent = text;
        list.appendChild(line);
    }
}

// Profile view

function showProfile(userId) {
    const uid = String(userId);
    currentProfileUserId = uid;
    const state = getCurrentState();
    const events = getCurrentEvents();

    const info = state[uid];

    const profilePanel = document.getElementById("profile-view");
    profilePanel.classList.add("visible");

    const usernameElem = document.getElementById("profile-username");
    const userIdElem = document.getElementById("profile-userid");
    const divisionElem = document.getElementById("profile-division");
    const rankElem = document.getElementById("profile-rank");
    const historyElem = document.getElementById("profile-history");
    const profileLinkBtn = document.getElementById("profile-link-btn");

    const avatarBox = document.querySelector(".avatar-placeholder");

    // Avatar
    avatarBox.innerHTML = "";
    const img = document.createElement("img");
    img.className = "avatar-img";
    img.src = `data/avatars/${uid}.png`;
    img.alt = "Avatar";
    img.onerror = () => {
        avatarBox.innerHTML = "<span>Avatar</span>";
    };
    avatarBox.appendChild(img);

    // Basic info
    if (!info) {
        usernameElem.textContent = "Unknown user";
        userIdElem.textContent = `User ID: ${uid}`;
        divisionElem.textContent = "Division: not found in current state";
        rankElem.textContent = "Rank: n/a";
    } else {
        const uname = getLatestUsername(uid, info.username);
        usernameElem.textContent = uname;
        userIdElem.textContent = `User ID: ${uid}`;

        let divText = info.division;
        // OA instructors conceptually belong to UNION in your lore
        if (currentMode === "CCA" && info.division === "ACADEMY") {
            divText = "UNION (Academy)";
        }
        if (currentMode === "CCA" && CCA_HIGH_COMMAND_RANKS.has(info.rank_name)) {
            divText = "High Command";
        }

        divisionElem.textContent = `Division: ${divText}`;
        rankElem.textContent = `Rank: ${info.rank_name}`;
    }

    // Username history inline chain
    const history = usernameHistory[uid];
    if (Array.isArray(history) && history.length > 0) {
        const chain = history.join(" \u2192 ");
        historyElem.textContent = `Past usernames: ${chain}`;
    } else {
        historyElem.textContent = "Past usernames: n/a";
    }

    // Events
    const eventsList = document.getElementById("profile-events-list");
    eventsList.innerHTML = "";

    const userEvents = events
        .filter(ev => String(ev.user_id) === uid)
        .sort((a, b) => {
            if (a.date > b.date) return -1;
            if (a.date < b.date) return 1;
            return 0;
        });

    if (userEvents.length === 0) {
        eventsList.innerHTML = `<div class="info-text">No events recorded for this user in this branch.</div>`;
        return;
    }

    for (const ev of userEvents) {
        const line = document.createElement("div");
        line.className = "timeline-entry";

        let text = `[${ev.date}] ${ev.type} - ${getEventUsername(ev)}`;

        if (ev.type === "enlistment") {
            text += ` joined ${ev.division} as ${ev.rank_name}`;
        } else if (ev.type === "discharge") {
            text += ` left ${ev.division} (${ev.old_rank_name})`;
        } else if (ev.type === "promotion") {
            text += ` in ${ev.division}: ${ev.old_rank_name} -> ${ev.new_rank_name}`;
        } else if (ev.type === "demotion") {
            text += ` in ${ev.division}: ${ev.old_rank_name} -> ${ev.new_rank_name}`;
        } else if (ev.type === "division_transfer") {
            text += ` moved ${ev.old_division} -> ${ev.new_division}`;
        } else if (ev.type === "username_change") {
            text += ` changed username from ${ev.old_username} to ${ev.new_username}`;
        }

        line.textContent = text;
        eventsList.appendChild(line);
    }

}

function hideProfile() {
    const profilePanel = document.getElementById("profile-view");
    profilePanel.classList.remove("visible");
}

// Init

async function init() {
    try {
        await loadData();
    } catch (err) {
        console.error("Failed to load data:", err);
    }

    // Mode toggle
    document.getElementById("mode-toggle").addEventListener("click", () => {
        toggleMode();
    });

    // Sidebar nav
    document.querySelectorAll(".nav-button").forEach(btn => {
        const view = btn.dataset.view;
        if (!view) return;
        btn.addEventListener("click", () => {
            setActiveView(view);
        });
    });

    // Division buttons
    document.querySelectorAll(".division-button").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!btn.dataset.division) return;
            document.querySelectorAll(".division-button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderDivision(btn.dataset.division);
        });
    });

    // Search
    document.getElementById("search-button").addEventListener("click", runSearch);
    document.getElementById("search-input").addEventListener("keyup", e => {
        if (e.key === "Enter") runSearch();
    });

    // Timeline search
    document.getElementById("timeline-search").addEventListener("input", renderTimeline);

    // Profile back
    document.getElementById("profile-back").addEventListener("click", () => {
        hideProfile();
    });

    // Initial mode setup (CCA by default)
    setupModeUI();
    setActiveView("divisions");
}

window.addEventListener("DOMContentLoaded", init);



// Link to Roblox profile button
document.getElementById("profile-link-btn").addEventListener("click", () => {
    if (!currentProfileUserId) return;
    window.open(
        `https://www.roblox.com/users/${currentProfileUserId}/profile`,
        "_blank",
        "noopener"
    );
});
