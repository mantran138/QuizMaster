/**
 * Multiplayer Room Creation/Joining
 * This file handles room creation and joining on multiplayer/index.html
 * Game logic is handled by lobby.js on lobby.html
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
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
        console.warn("Using example Firebase config. Copy config/firebaseConfig.example.js to config/firebaseConfig.js and fill in your project credentials.");
        return await import("../../config/firebaseConfig.js");
    }
}

const { firebaseConfig, initialAuthToken = null } = await loadFirebaseConfig();

const ROOMS_COLLECTION = "quizRooms";

let app;
let db;
let auth;
let userId = null;

// Elements will be cached after DOM is ready
let elements = {};

function cacheElements() {
    elements = {
        authStatus: document.getElementById("auth-status"),
        hostName: document.getElementById("host-name"),
        hostFileInput: document.getElementById("host-file-input"),
        hostFileStatus: document.getElementById("host-file-status"),
        createRoomBtn: document.getElementById("create-room-btn"),
        hostError: document.getElementById("host-error"),
        joinName: document.getElementById("joiner-name"),
        joinRoomCode: document.getElementById("room-code"),
        joinRoomBtn: document.getElementById("join-room-btn"),
        joinError: document.getElementById("joiner-error")
    };
}

function bindUI() {
    elements.hostFileInput?.addEventListener("change", () => {
        const file = elements.hostFileInput.files?.[0];
        elements.hostFileStatus.textContent = file ? file.name : "No file selected.";
    });

    elements.createRoomBtn?.addEventListener("click", hostRoom);
    elements.joinRoomBtn?.addEventListener("click", joinRoom);

    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code && elements.joinRoomCode) {
        elements.joinRoomCode.value = code.toUpperCase();
        elements.joinName?.focus();
    }
}

// Wait for DOM to be ready before initializing
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

async function initializeFirebase() {
    try {
        if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
            elements.authStatus.textContent = "⚠️ Firebase config missing";
            return;
        }

        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        elements.authStatus.textContent = "Authenticating...";

        await new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (user) {
                    userId = user.uid;
                    elements.authStatus.textContent = `User ID: ${userId}`;
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
                    elements.authStatus.textContent = `User ID: ${userId}`;
                } catch (error) {
                    console.error("Auth error", error);
                    elements.authStatus.textContent = "Auth failed";
                }

                unsubscribe();
                resolve();
            });
        });
    } catch (error) {
        console.error("Firebase init error", error);
        elements.authStatus.textContent = "Firebase init failed";
    }
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function hostRoom() {
    const name = elements.hostName?.value.trim();
    const file = elements.hostFileInput?.files?.[0] ?? null;
    if (elements.hostError) elements.hostError.textContent = "";

    if (!name || !file) {
        if (elements.hostError) elements.hostError.textContent = "Enter your name and upload a quiz JSON.";
        return;
    }
    if (file.type !== "application/json") {
        if (elements.hostError) elements.hostError.textContent = "Please upload a valid JSON file.";
        return;
    }
    if (!userId) {
        if (elements.hostError) elements.hostError.textContent = "Authentication pending. Try again.";
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const quizJson = JSON.parse(event.target.result);
            if (!quizJson.questions || !Array.isArray(quizJson.questions) || quizJson.questions.length === 0) {
                throw new Error("Invalid quiz format.");
            }

            // Shuffle answer options for each question
            quizJson.questions.forEach((question) => {
                if (!Array.isArray(question.options) || question.correct == null) {
                    return;
                }
                const correctAnswer = question.options[question.correct];
                const shuffledIndices = [...Array(question.options.length).keys()];
                for (let i = shuffledIndices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
                }
                const shuffledOptions = shuffledIndices.map((idx) => question.options[idx]);
                question.options = shuffledOptions;
                question.correct = shuffledOptions.indexOf(correctAnswer);
            });

            const roomId = generateRoomId();
            const roomRef = doc(db, ROOMS_COLLECTION, roomId);
            const roomData = {
                roomId,
                hostId: userId,
                hostName: name,
                quiz: quizJson,
                state: "lobby",
                currentQuestionIndex: 0,
                createdAt: Date.now(),
                questionStartTime: null,
                playersAnswered: []
            };

            await setDoc(roomRef, roomData);
            await addPlayerToRoom(roomId, name, true);
            
            // Save to session and redirect to lobby page
            sessionStorage.setItem("quizmaster_room", JSON.stringify({
                roomId: roomId,
                playerName: name,
                host: true
            }));
            
            navigateToLobby(roomId);
        } catch (error) {
            console.error("Host error", error);
            if (elements.hostError) elements.hostError.textContent = `Failed to create room: ${error.message}`;
        }
    };

    reader.readAsText(file);
}

async function joinRoom() {
    const name = elements.joinName?.value.trim();
    const roomId = elements.joinRoomCode?.value.trim().toUpperCase();
    if (elements.joinError) elements.joinError.textContent = "";

    if (!name || !roomId) {
        if (elements.joinError) elements.joinError.textContent = "Enter your name and the room code.";
        return;
    }
    if (!userId) {
        if (elements.joinError) elements.joinError.textContent = "Authentication pending. Try again.";
        return;
    }

    try {
        const roomRef = doc(db, ROOMS_COLLECTION, roomId);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            alertModal(`Room code "${roomId}" not found.`);
            if (elements.joinError) elements.joinError.textContent = `Room code "${roomId}" not found.`;
            return;
        }

        const roomData = roomSnap.data();
        if (roomData.state !== "lobby") {
            if (elements.joinError) elements.joinError.textContent = "Game already started or finished.";
            return;
        }

        await addPlayerToRoom(roomId, name, false);
        
        // Save to session and redirect to lobby page
        sessionStorage.setItem("quizmaster_room", JSON.stringify({
            roomId: roomId,
            playerName: name,
            host: false
        }));
        
        navigateToLobby(roomId);
    } catch (error) {
        console.error("Join error", error);
        if (elements.joinError) elements.joinError.textContent = "Unable to join room. Try again.";
    }
}

async function addPlayerToRoom(roomId, name, host) {
    const playerRef = doc(db, ROOMS_COLLECTION, roomId, "players", userId);
    const playerDoc = {
        id: userId,
        name,
        score: 0,
        killstreak: 0,
        currentQuestionIndex: 0,
        isHost: host,
        lastAnswerTime: 0
    };
    await setDoc(playerRef, playerDoc);
}

// Simple alert modal for error messages
function alertModal(message, callback) {
    const modalId = "custom-alert-modal";
    document.getElementById(modalId)?.remove();

    const modal = document.createElement("div");
    modal.id = modalId;
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50";
    modal.innerHTML = `
        <div class="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <h4 class="text-xl font-bold text-gray-800 mb-4">Notification</h4>
            <p class="text-gray-600 mb-6">${message}</p>
            <button class="primary-btn w-full py-2 text-white rounded-lg font-semibold">OK</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("button")?.addEventListener("click", () => {
        modal.remove();
        if (callback) callback();
    });
}

// Natural navigation that bypasses ad blockers
function navigateToLobby(roomId) {
    const link = document.createElement("a");
    link.href = "lobby.html";
    link.style.display = "none";
    document.body.appendChild(link);
    
    setTimeout(() => {
        link.click();
        
        setTimeout(() => {
            link.remove();
            if (document.body.contains(link) || 
                window.location.pathname.includes("index.html") || 
                window.location.pathname.endsWith("/multiplayer/")) {
                showRedirectModal(roomId);
            }
        }, 500);
    }, 100);
    
    setTimeout(() => {
        if (window.location.pathname.includes("index.html") || 
            window.location.pathname.endsWith("/multiplayer/")) {
            showRedirectModal(roomId);
        }
    }, 2000);
}

// Fallback redirect modal when browser extensions block navigation
function showRedirectModal(roomId) {
    const modalId = "redirect-modal";
    document.getElementById(modalId)?.remove();

    const modal = document.createElement("div");
    modal.id = modalId;
    modal.className = "fixed inset-0 z-50 flex items-center justify-center";
    modal.style.background = "rgba(0, 0, 0, 0.8)";
    modal.innerHTML = `
        <div class="glass-panel p-8 rounded-2xl max-w-md w-full text-center" style="background: var(--glass-bg); border: 1px solid var(--glass-border);">
            <div class="text-5xl mb-4">🎮</div>
            <h3 class="text-2xl font-bold mb-2" style="color: var(--text-primary);">Room Created!</h3>
            <p class="mb-4" style="color: var(--text-secondary);">Room Code: <span class="title-gradient font-bold text-xl">${roomId}</span></p>
            <p class="text-sm mb-6" style="color: var(--text-muted);">Click below to enter the game lobby</p>
            <a href="lobby.html" class="primary-btn px-8 py-3 rounded-full font-semibold inline-block" style="text-decoration: none;">
                Enter Lobby →
            </a>
            <p class="text-xs mt-4" style="color: var(--text-muted);">
                (Auto-redirect may be blocked by a browser extension)
            </p>
        </div>
    `;
    document.body.appendChild(modal);
}
