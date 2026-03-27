import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyARUKbQZYDW7wAFu6ZYqdtrUTU3cVMQhtY",
  authDomain: "my-project-1d1e1.firebaseapp.com",
  projectId: "my-project-1d1e1",
  appId: "1:323525462401:web:31ee6fcce91abc8fb1c080",
};

export const SITE_LOGIN_EMAIL = "testnow683@gmail.com";
export const ADMIN_EMAIL = "abhinavkumar09870@gmail.com";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const authReady = setPersistence(auth, browserLocalPersistence).catch(() => {
  // Keep auth functional even if persistence cannot be configured in this browser mode.
});
export const db = getFirestore(app);
