export type PublicUser = {
  name: string;
  email: string;
  notify?: boolean;
};

type StoredUser = PublicUser & { password: string };

const USERS_KEY = "mesa-users";
const SESSION_KEY = "mesa-session";

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as StoredUser[];
  } catch {
    return [];
  }
}

export function readSession(): PublicUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

export function writeSession(user: PublicUser) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ name: user.name, email: user.email, notify: user.notify }),
  );
  emitSessionChanged();
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
  emitSessionChanged();
}

export function firstName(user: PublicUser) {
  const fromName = user.name.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  return user.email.split("@")[0];
}

function emitSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("mesa-session-changed"));
}

export function signUp(input: {
  name: string;
  email: string;
  password: string;
  notify: boolean;
}) {
  const email = input.email.trim().toLowerCase();
  const users = readUsers();
  if (users.some((user) => user.email === email)) {
    throw new Error("An account with that email already exists.");
  }
  const user: StoredUser = {
    name: input.name.trim(),
    email,
    password: input.password,
    notify: input.notify,
  };
  localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
  writeSession({ name: user.name, email: user.email });
  return { name: user.name, email: user.email };
}

export function signIn(email: string, password: string) {
  const user = readUsers().find((item) => item.email === email.trim().toLowerCase());
  if (!user || user.password !== password) {
    throw new Error("Email or password is not correct.");
  }
  writeSession({ name: user.name, email: user.email });
  return { name: user.name, email: user.email };
}
