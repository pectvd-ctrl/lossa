// script.js — validation code unique + 5 tentatives + blocage temporaire
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ---------- Config Firebase ----------
   Remplace par tes valeurs
*/
const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const form = document.getElementById('loginForm');
const msg = document.getElementById('message');

// Récupère les paramètres UAM de CoovaChilli
function getQueryParams() {
  const params = {};
  location.search.replace(/^\?/, '').split('&').forEach(pair => {
    if (!pair) return;
    const [k, v] = pair.split('=').map(decodeURIComponent);
    params[k] = v === undefined ? '' : v;
  });
  return params;
}
const params = getQueryParams();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const code = document.getElementById('code').value.trim();

  if (!email || !code) {
    msg.textContent = "Veuillez renseigner un email et un code.";
    msg.style.color = "red";
    return;
  }

  msg.textContent = "Vérification...";
  msg.style.color = "black";

  try {
    const codeRef = doc(db, "users", code);  // docId = code
    const codeSnap = await getDoc(codeRef);

    if (!codeSnap.exists()) {
      msg.textContent = "Code invalide.";
      msg.style.color = "red";
      return;
    }

    const data = codeSnap.data();
    const now = new Date();

    // Vérifie si le code est bloqué temporairement
    if (data.blockedUntil && now < data.blockedUntil.toDate()) {
      const remaining = Math.ceil((data.blockedUntil.toDate() - now)/60000);
      msg.textContent = `Code temporairement bloqué. Réessayez dans ${remaining} min.`;
      msg.style.color = "red";
      return;
    }

    // Code correct → reset tentatives
    await updateDoc(codeRef, {
      attempts: 0,
      blockedUntil: null
    });

    // Enregistre l'email utilisé dans logs
    await addDoc(collection(db, "logs"), {
      email: email,
      code: code,
      timestamp: serverTimestamp()
    });

    msg.textContent = "Connexion réussie — redirection...";
    msg.style.color = "green";

    // Redirection vers CoovaChilli (/logon)
    const uamip = params.uamip || "";
    const uamport = params.uamport || "";
    const challenge = params.challenge || "";
    const mac = params.mac || "";

    if (uamip && uamport) {
      const logonUrl = `http://${uamip}:${uamport}/logon?username=${encodeURIComponent(email)}&challenge=${encodeURIComponent(challenge)}&mac=${encodeURIComponent(mac)}`;
      window.location.href = logonUrl;
    } else if (params.redirect) {
      window.location.href = params.redirect;
    }

  } catch (err) {
    console.error(err);

    // Tentative échouée → incrémente compteur et bloque si >= 5
    const codeRef = doc(db, "users", document.getElementById('code').value.trim());
    const codeSnap = await getDoc(codeRef);
    if (codeSnap.exists()) {
      let attempts = codeSnap.data().attempts || 0;
      attempts++;
      const updateData = { attempts: attempts };
      if (attempts >= 5) {
        updateData.blockedUntil = new Date(new Date().getTime() + 10*60*1000); // 10 min
        updateData.attempts = 0;
      }
      await updateDoc(codeRef, updateData);
    }

    msg.textContent = "Erreur interne. Réessayez.";
    msg.style.color = "red";
  }
});
