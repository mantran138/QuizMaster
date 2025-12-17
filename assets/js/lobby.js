import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    onSnapshot,
    collection,
    query,
    addDoc,
    getDocs,
    deleteDoc,
    runTransaction,
    arrayUnion,
    orderBy,
    limit,
    writeBatch,
    setLogLevel
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Suppress Firebase console logging
setLogLevel("silent");

async function loadFirebaseConfig() {
    if (typeof window.__firebase_config !== "undefined") {
        return {
            firebaseConfig: JSON.parse(window.__firebase_config),
            initialAuthToken: typeof window.__initial_auth_token !== "undefined" ? window.__initial_auth_token : null
        };
    }
    try {
        return await import("../../config/firebaseConfig.js");
    } catch (error) {
        console.warn("Firebase config error");
        return await import("../../config/firebaseConfig.js");
    }
}

const { firebaseConfig, initialAuthToken = null } = await loadFirebaseConfig();

const SCORING = {
    BASE_POINTS: 10,
    SPEED_BONUS_MAX: 5,
    TIME_WINDOW: 15000  // 15 seconds for speed bonus to decay
};

const ROOMS_COLLECTION = "quizRooms";

let app, db, auth;
let userId = null;
let userName = "";
let currentRoomId = null;
let currentQuiz = null;
let currentQuestionIndex = 0;
let isHost = false;
let unsubscribeRoom = null;
let unsubscribePlayers = null;
let unsubscribeChat = null;

let elements = {};

function cacheElements() {
    elements = {
        authStatus: document.getElementById("auth-status"),
        lobbyRoomCode: document.getElementById("lobby-room-code"),
        copyCodeBtn: document.getElementById("copy-code-btn"),
        hostStartSection: document.getElementById("host-start-section"),
        lobbyPlayersList: document.getElementById("lobby-players-list"),
        playerCount: document.getElementById("player-count"),
        lobbyChatMessages: document.getElementById("lobby-chat-messages"),
        lobbyChatInput: document.getElementById("lobby-chat-input"),
        lobbyChatSend: document.getElementById("lobby-chat-send"),
        startGameBtn: document.getElementById("start-game-btn"),
        leaveRoomBtn: document.getElementById("leave-room-btn"),
        multiplayerGame: document.getElementById("multiplayer-game"),
        scoreboard: document.getElementById("game-scoreboard"),
        gameChatMessages: document.getElementById("chat-messages"),
        gameChatInput: document.getElementById("chat-input"),
        gameChatSend: document.getElementById("game-chat-send"),
        quizCard: document.getElementById("multiplayer-quiz-card"),
        questionNumber: document.getElementById("mp-question-number"),
        questionText: document.getElementById("mp-question-text"),
        answersContainer: document.getElementById("mp-answers-container"),
        feedback: document.getElementById("mp-feedback"),
        actionMessage: document.getElementById("mp-action-message"),
        readyBtn: document.getElementById("mp-ready-btn"),
        nextBtn: document.getElementById("mp-next-btn"),
        gameEnd: document.getElementById("mp-game-end")
    };
}

function bindUI() {
    if (elements.copyCodeBtn) {
        elements.copyCodeBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(currentRoomId);
            elements.copyCodeBtn.textContent = "✓ Copied!";
            setTimeout(() => {
                elements.copyCodeBtn.textContent = "📋 Copy Code";
            }, 2000);
        });
    }

    if (elements.startGameBtn) {
        elements.startGameBtn.addEventListener("click", startMultiplayerGame);
    }

    if (elements.leaveRoomBtn) {
        elements.leaveRoomBtn.addEventListener("click", () => leaveRoom(false));
    }

    if (elements.lobbyChatSend) {
        elements.lobbyChatSend.addEventListener("click", sendChatMessage);
    }

    if (elements.gameChatSend) {
        elements.gameChatSend.addEventListener("click", sendChatMessage);
    }

    if (elements.lobbyChatInput) {
        elements.lobbyChatInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") sendChatMessage();
        });
    }

    if (elements.gameChatInput) {
        elements.gameChatInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") sendChatMessage();
        });
    }

    if (elements.nextBtn) {
        elements.nextBtn.addEventListener("click", advanceQuestion);
    }

    if (elements.readyBtn) {
        elements.readyBtn.addEventListener("click", markAsReady);
    }
}

async function initializeFirebase() {
    try {
        if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
            if (elements.authStatus) elements.authStatus.textContent = "⚠️ Firebase config missing";
            return;
        }

        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        if (elements.authStatus) elements.authStatus.textContent = "Authenticating...";

        await new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (user) {
                    userId = user.uid;
                    if (elements.authStatus) elements.authStatus.textContent = `User ID: ${userId}`;
                    unsubscribe();
                    resolve();
                    return;
                }

                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                    userId = auth.currentUser.uid;
                    if (elements.authStatus) elements.authStatus.textContent = `User ID: ${userId}`;
                } catch (error) {
                    console.error("Auth error", error);
                    if (elements.authStatus) elements.authStatus.textContent = "Auth failed";
                }

                unsubscribe();
                resolve();
            });
        });

        // After auth, load room data
        loadRoomFromSession();
    } catch (error) {
        console.error("Firebase init error", error);
        if (elements.authStatus) elements.authStatus.textContent = "Firebase init failed";
    }
}

function loadRoomFromSession() {
    // Get room data from sessionStorage
    const roomData = sessionStorage.getItem("quizmaster_room");
    if (!roomData) {
        alert("No room data found. Redirecting to setup...");
        window.location.href = "index.html";
        return;
    }

    const { roomId, playerName, host } = JSON.parse(roomData);
    currentRoomId = roomId;
    userName = playerName;
    isHost = host;

    // Display room code
    if (elements.lobbyRoomCode) {
        elements.lobbyRoomCode.textContent = roomId;
    }

    // Show/hide host controls
    if (isHost && elements.hostStartSection) {
        elements.hostStartSection.classList.remove("hidden");
    }

    // Setup listeners
    setupRoomListeners(roomId);
}

function setupRoomListeners(roomId) {
    unsubscribeChat = setupChatListener();

    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    unsubscribeRoom = onSnapshot(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
            alert("Room closed by host.");
            sessionStorage.removeItem("quizmaster_room");
            window.location.href = "index.html";
            return;
        }

        const roomData = snapshot.data();
        currentQuiz = roomData.quiz;
        currentQuestionIndex = roomData.currentQuestionIndex ?? 0;

        if (roomData.state === "playing") {
            startGameView(roomData);
        } else if (roomData.state === "finished") {
            startGameView(roomData);
            showMultiplayerResults();
        }
    });

    const playersRef = collection(db, ROOMS_COLLECTION, roomId, "players");
    unsubscribePlayers = onSnapshot(playersRef, (querySnapshot) => {
        const players = [];
        querySnapshot.forEach((docSnap) => players.push(docSnap.data()));
        updateLobbyPlayers(players);
        updateScoreboard(players);
    });
}

function updateLobbyPlayers(players) {
    if (!elements.lobbyPlayersList) return;

    elements.lobbyPlayersList.innerHTML = "";
    if (elements.playerCount) elements.playerCount.textContent = players.length;

    players.sort((a, b) => Number(b.isHost) - Number(a.isHost));

    players.forEach((player) => {
        const card = document.createElement("div");
        card.className = `player-card p-3 rounded-xl flex items-center justify-between ${player.isHost ? "is-host" : ""} ${player.id === userId ? "current-user" : ""}`;
        card.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-2xl">${player.isHost ? "👑" : "🎮"}</span>
                <div>
                    <span class="font-bold" style="color: var(--text-primary);">${player.name}</span>
                    ${player.isHost ? '<span class="text-xs ml-2" style="color: var(--neon-magenta);">HOST</span>' : ""}
                    ${player.id === userId ? '<span class="text-xs ml-2" style="color: var(--neon-cyan);">(You)</span>' : ""}
                </div>
            </div>
            <span class="text-sm" style="color: var(--text-muted);">Ready</span>
        `;
        elements.lobbyPlayersList.appendChild(card);
    });
}

function updateScoreboard(players) {
    if (!elements.scoreboard) return;

    elements.scoreboard.innerHTML = "";
    const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    sorted.forEach((player, index) => {
        const medals = ["🥇", "🥈", "🥉"];
        const medal = medals[index] || `#${index + 1}`;
        const isReady = player.readyForNext === true;
        const readyIndicator = isReady ? '<span class="text-green-400 text-xs ml-1">✓ Ready</span>' : '<span class="text-yellow-400 text-xs ml-1">⏳</span>';
        const row = document.createElement("div");
        row.className = `flex justify-between items-center p-2 rounded-lg ${player.id === userId ? "current-user" : ""}`;
        row.style.background = player.id === userId ? "rgba(0, 245, 255, 0.1)" : "";
        row.innerHTML = `
            <div class="flex items-center gap-2">
                <span>${medal}</span>
                <span class="font-semibold" style="color: var(--text-primary);">${player.name}</span>
                ${readyIndicator}
            </div>
            <span class="font-bold" style="color: var(--neon-cyan);">${player.score ?? 0}</span>
        `;
        elements.scoreboard.appendChild(row);
    });

    // Check if all players are ready - auto advance for host
    checkAllPlayersReady(players);
}

// Chat Functions
function setupChatListener() {
    if (!currentRoomId) return null;

    const chatRef = collection(db, ROOMS_COLLECTION, currentRoomId, "chat");
    const chatQuery = query(chatRef, orderBy("timestamp", "asc"), limit(100));

    return onSnapshot(chatQuery, (snapshot) => {
        const chatContainer = elements.lobbyChatMessages || elements.gameChatMessages;
        if (!chatContainer) return;

        chatContainer.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const msgDiv = document.createElement("div");
            msgDiv.className = `chat-message p-2 rounded-lg ${msg.senderId === userId ? "ml-auto" : ""}`;
            msgDiv.style.maxWidth = "80%";
            msgDiv.style.background = msg.senderId === userId ? "rgba(0, 245, 255, 0.15)" : "rgba(255, 255, 255, 0.05)";
            msgDiv.innerHTML = `
                <span class="text-xs font-bold" style="color: ${msg.senderId === userId ? 'var(--neon-cyan)' : 'var(--neon-magenta)'};">${msg.senderName}</span>
                <p class="text-sm" style="color: var(--text-primary);">${msg.text}</p>
            `;
            chatContainer.appendChild(msgDiv);
        });
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

async function sendChatMessage() {
    const input = elements.lobbyChatInput || elements.gameChatInput;
    if (!input) return;

    const text = input.value.trim();
    if (!text || !currentRoomId) return;

    input.value = "";

    try {
        const chatRef = collection(db, ROOMS_COLLECTION, currentRoomId, "chat");
        await addDoc(chatRef, {
            senderId: userId,
            senderName: userName,
            text: text,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error("Chat error", error);
    }
}

// Game Functions
async function startMultiplayerGame() {
    if (!isHost || !currentRoomId) return;

    try {
        const roomRef = doc(db, ROOMS_COLLECTION, currentRoomId);
        await updateDoc(roomRef, {
            state: "playing",
            currentQuestionIndex: 0,
            questionStartTime: Date.now()
        });
    } catch (error) {
        console.error("Start game error", error);
        alert("Failed to start game.");
    }
}

function startGameView(roomData) {
    // Hide lobby elements, show game
    document.querySelector(".header").style.display = "none";
    document.querySelectorAll(".glass-panel").forEach(el => {
        if (!el.closest("#multiplayer-game")) {
            el.style.display = "none";
        }
    });
    document.querySelector(".text-center.mt-6")?.style.setProperty("display", "none");

    if (elements.multiplayerGame) {
        elements.multiplayerGame.classList.remove("hidden");
        elements.multiplayerGame.style.display = "grid";
    }

    if (roomData.state === "playing") {
        currentQuestionIndex = roomData.currentQuestionIndex ?? 0;
        displayQuestion(currentQuestionIndex);
    }
}

function displayQuestion(index) {
    if (!currentQuiz || !currentQuiz.questions || index >= currentQuiz.questions.length) {
        return;
    }

    const question = currentQuiz.questions[index];
    if (elements.questionNumber) {
        elements.questionNumber.textContent = `Question ${index + 1} of ${currentQuiz.questions.length}`;
    }
    if (elements.questionText) {
        elements.questionText.textContent = question.question;
    }

    if (elements.answersContainer) {
        elements.answersContainer.innerHTML = "";
        question.options.forEach((option, i) => {
            const btn = document.createElement("button");
            btn.className = "answer-btn";
            btn.textContent = option;
            btn.addEventListener("click", () => submitAnswer(i));
            elements.answersContainer.appendChild(btn);
        });
    }

    if (elements.feedback) {
        elements.feedback.classList.add("hidden");
        elements.feedback.textContent = "";
        elements.feedback.style.display = "none";
    }

    if (elements.nextBtn) {
        elements.nextBtn.classList.add("hidden");
    }

    // Reset ready button to faded/disabled state
    if (elements.readyBtn) {
        elements.readyBtn.disabled = true;
        elements.readyBtn.textContent = "✋ Ready for Next";
        elements.readyBtn.className = "secondary-btn w-full py-3 rounded-full font-semibold mt-4 opacity-30 cursor-not-allowed";
        elements.readyBtn.style.cssText = "opacity: 0.3 !important; cursor: not-allowed !important;";
    }
}

async function submitAnswer(selectedIndex) {
    if (!currentQuiz || !currentRoomId) return;

    const question = currentQuiz.questions[currentQuestionIndex];
    const isCorrect = selectedIndex === question.correct;

    // Disable all answer buttons
    const buttons = elements.answersContainer?.querySelectorAll(".answer-btn");
    buttons?.forEach((btn, i) => {
        btn.disabled = true;
        if (i === question.correct) {
            btn.classList.add("correct");
        } else if (i === selectedIndex && !isCorrect) {
            btn.classList.add("incorrect");
        }
    });

    // Calculate speed bonus first (needed for feedback)
    let speedBonus = 0;
    if (isCorrect) {
        try {
            const roomRef = doc(db, ROOMS_COLLECTION, currentRoomId);
            const roomSnap = await getDoc(roomRef);
            if (roomSnap.exists() && roomSnap.data().questionStartTime) {
                const elapsed = Date.now() - roomSnap.data().questionStartTime;
                speedBonus = Math.max(0, Math.round(SCORING.SPEED_BONUS_MAX * (1 - elapsed / SCORING.TIME_WINDOW)));
            }
        } catch (error) {
            console.error("Speed bonus calculation error", error);
        }
    }

    // Show feedback with bonus info and explanation
    if (elements.feedback) {
        elements.feedback.classList.remove("hidden");
        if (isCorrect) {
            const bonusText = speedBonus > 0 ? ` (+${speedBonus} speed bonus!)` : "";
            let feedbackHTML = `<div>✓ Correct! +${SCORING.BASE_POINTS} pts${bonusText}</div>`;
            if (question.explanation) {
                feedbackHTML += `<div class="text-sm mt-2" style="opacity: 0.9;">${question.explanation}</div>`;
            }
            elements.feedback.innerHTML = feedbackHTML;
            elements.feedback.className = "feedback correct";
        } else {
            let feedbackHTML = `<div>✗ Wrong! The answer was: ${question.options[question.correct]}</div>`;
            if (question.explanation) {
                feedbackHTML += `<div class="text-sm mt-2" style="opacity: 0.9;">${question.explanation}</div>`;
            }
            elements.feedback.innerHTML = feedbackHTML;
            elements.feedback.className = "feedback incorrect";
        }
        elements.feedback.style.display = "block";
    }

    // Enable ready button after answering
    if (elements.readyBtn) {
        elements.readyBtn.disabled = false;
        elements.readyBtn.className = "secondary-btn w-full py-3 rounded-full font-semibold mt-4 glow-effect";
        elements.readyBtn.style.cssText = "opacity: 1 !important; cursor: pointer !important;";
    }

    // Update score in Firebase
    if (isCorrect) {
        try {
            const playerRef = doc(db, ROOMS_COLLECTION, currentRoomId, "players", userId);
            const playerSnap = await getDoc(playerRef);
            if (playerSnap.exists()) {
                const currentScore = playerSnap.data().score ?? 0;
                const points = SCORING.BASE_POINTS + speedBonus;
                await updateDoc(playerRef, { score: currentScore + points });
            }
        } catch (error) {
            console.error("Score update error", error);
        }
    }

    // Show next button for host
    if (isHost && elements.nextBtn) {
        elements.nextBtn.classList.remove("hidden");
    }
}

async function advanceQuestion() {
    if (!isHost || !currentRoomId) return;

    const nextIndex = currentQuestionIndex + 1;

    try {
        const roomRef = doc(db, ROOMS_COLLECTION, currentRoomId);
        
        // Reset all players' ready status
        const playersRef = collection(db, ROOMS_COLLECTION, currentRoomId, "players");
        const playersSnap = await getDocs(playersRef);
        const resetPromises = playersSnap.docs.map(playerDoc => 
            updateDoc(doc(db, ROOMS_COLLECTION, currentRoomId, "players", playerDoc.id), { readyForNext: false })
        );
        await Promise.all(resetPromises);
        
        if (nextIndex >= currentQuiz.questions.length) {
            await updateDoc(roomRef, { state: "finished" });
        } else {
            await updateDoc(roomRef, {
                currentQuestionIndex: nextIndex,
                questionStartTime: Date.now()
            });
            displayQuestion(nextIndex);
        }
    } catch (error) {
        console.error("Advance question error", error);
    }
}

// Mark current player as ready for next question
async function markAsReady() {
    if (!currentRoomId || !userId) return;

    try {
        const playerRef = doc(db, ROOMS_COLLECTION, currentRoomId, "players", userId);
        await updateDoc(playerRef, { readyForNext: true });
        
        // Update button to show clicked state
        if (elements.readyBtn) {
            elements.readyBtn.textContent = "✅ Ready!";
            elements.readyBtn.disabled = true;
            elements.readyBtn.className = "secondary-btn w-full py-3 rounded-full font-semibold mt-4";
            elements.readyBtn.style.cssText = "opacity: 0.7 !important; cursor: default !important; background: rgba(16, 185, 129, 0.3) !important; border-color: rgba(16, 185, 129, 0.5) !important;";
        }
    } catch (error) {
        console.error("Mark ready error", error);
    }
}

// Check if all players are ready and auto-advance (host only)
function checkAllPlayersReady(players) {
    if (!isHost || players.length === 0) return;
    
    const allReady = players.every(p => p.readyForNext === true);
    
    if (allReady && players.length > 0) {
        // All players ready - auto advance after short delay
        setTimeout(() => {
            advanceQuestion();
        }, 500);
    }
}

function showMultiplayerResults() {
    if (elements.quizCard) elements.quizCard.style.display = "none";
    if (elements.nextBtn) elements.nextBtn.classList.add("hidden");

    if (elements.gameEnd) {
        elements.gameEnd.classList.remove("hidden");
        elements.gameEnd.innerHTML = `
            <div class="text-6xl mb-4">🏆</div>
            <h3 class="text-3xl font-bold title-gradient">Game Over!</h3>
            <p class="text-xl mt-2" style="color: var(--text-secondary);">Check the scoreboard for final results!</p>
            <button onclick="window.location.href='index.html'" class="primary-btn px-8 py-3 rounded-full mt-6">Play Again</button>
        `;
    }
}

async function leaveRoom(silent = false) {
    if (unsubscribeRoom) unsubscribeRoom();
    if (unsubscribePlayers) unsubscribePlayers();
    if (unsubscribeChat) unsubscribeChat();

    if (currentRoomId && userId) {
        try {
            const playerRef = doc(db, ROOMS_COLLECTION, currentRoomId, "players", userId);
            await deleteDoc(playerRef);

            if (isHost) {
                const roomRef = doc(db, ROOMS_COLLECTION, currentRoomId);
                await deleteDoc(roomRef);
            }
        } catch (error) {
            console.error("Leave room error", error);
        }
    }

    sessionStorage.removeItem("quizmaster_room");

    if (!silent) {
        window.location.href = "index.html";
    }
}

// Handle page unload
window.addEventListener("beforeunload", () => {
    leaveRoom(true);
});

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        cacheElements();
        bindUI();
        initializeFirebase();
    });
} else {
    cacheElements();
    bindUI();
    initializeFirebase();
}
