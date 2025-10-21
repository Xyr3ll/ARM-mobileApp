import AsyncStorage from '@react-native-async-storage/async-storage';

export type SessionUser = {
  username: string;
  fullName: string;
};

const KEY = 'sessionUser';

export async function saveCurrentUser(user: SessionUser) {
  await AsyncStorage.setItem(KEY, JSON.stringify(user));
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function clearCurrentUser() {
  await AsyncStorage.removeItem(KEY);
}
