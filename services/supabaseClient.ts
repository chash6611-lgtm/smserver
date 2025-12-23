
import { createClient } from '@supabase/supabase-js';
import { Memo, RepeatType, UserProfile } from '../types.ts';
import { parseISO, isSameDay, getDay, getDate, getMonth } from 'date-fns';
import { Lunar } from 'lunar-javascript';

/** 
 * [안내] 서버 저장(Supabase) 설정:
 * 1. supabaseUrl: Supabase 프로젝트의 API URL
 * 2. supabaseAnonKey: 프로젝트의 Anon Public Key
 */
const supabaseUrl = 'https://klarhvoglyapszhdwabp.supabase.co';
const supabaseAnonKey = 'sb_publishable_uQl3IfjeLOz4_PA-o01rmA_fWh49XPE';

export const isSupabaseConfigured = 
  supabaseUrl.includes('supabase.co') && 
  !supabaseUrl.includes('your-project-url') && 
  supabaseAnonKey.length > 10 &&
  !supabaseAnonKey.includes('your-anon-key');

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const LOCAL_STORAGE_KEY = 'daily_harmony_memos_v2';
const PROFILE_STORAGE_KEY = 'user_profile';

// --- 프로필 관련 기능 ---

export const fetchProfileFromCloud = async (userId: string = 'local_user'): Promise<UserProfile | null> => {
  if (!supabase) {
    const local = localStorage.getItem(PROFILE_STORAGE_KEY);
    return local ? JSON.parse(local) : null;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    
    if (data) {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data));
      return data;
    }
    return null;
  } catch (err) {
    console.error("프로필 로드 실패:", err);
    const local = localStorage.getItem(PROFILE_STORAGE_KEY);
    return local ? JSON.parse(local) : null;
  }
};

export const saveProfileCloud = async (profile: UserProfile): Promise<UserProfile | null> => {
  const profileData = {
    ...profile,
    user_id: 'local_user', // 현재는 단일 사용자 모드
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      // upsert: 존재하면 업데이트, 없으면 삽입 (user_id 기준)
      const { data, error } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'user_id' })
        .select();
      
      if (!error && data) {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data[0]));
        return data[0];
      }
      if (error) console.error("프로필 저장 에러:", error.message);
    } catch (e) {
      console.error("클라우드 프로필 저장 실패:", e);
    }
  }

  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileData));
  return profileData as UserProfile;
};

// --- 메모 관련 기능 ---

export const fetchMemosFromCloud = async (userId: string = 'local_user'): Promise<Memo[]> => {
  if (!supabase) {
    console.log("로컬 모드로 작동 중입니다.");
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  }

  try {
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    return data || [];
  } catch (err) {
    console.error("클라우드 데이터를 불러오는 중 오류 발생:", err);
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  }
};

export const getFilteredMemos = (allMemos: Memo[], targetDate: Date): Memo[] => {
  const targetDay = getDay(targetDate);
  const targetDateNum = getDate(targetDate);
  const targetMonth = getMonth(targetDate);
  const targetLunar = Lunar.fromDate(targetDate);

  return allMemos.filter(memo => {
    const memoDate = parseISO(memo.date);
    if (memo.repeat_type === RepeatType.NONE || !memo.repeat_type) {
      return isSameDay(memoDate, targetDate);
    }
    if (targetDate < memoDate && !isSameDay(memoDate, targetDate)) return false;

    switch (memo.repeat_type) {
      case RepeatType.WEEKLY: return getDay(memoDate) === targetDay;
      case RepeatType.MONTHLY: return getDate(memoDate) === targetDateNum;
      case RepeatType.YEARLY_SOLAR: return getMonth(memoDate) === targetMonth && getDate(memoDate) === targetDateNum;
      case RepeatType.YEARLY_LUNAR:
        const memoLunar = Lunar.fromDate(memoDate);
        return memoLunar.getMonth() === targetLunar.getMonth() && memoLunar.getDay() === targetLunar.getDay();
      default: return false;
    }
  });
};

export const saveMemoCloud = async (memo: Partial<Memo>): Promise<Memo | null> => {
  const newMemo = {
    user_id: 'local_user',
    date: memo.date!,
    type: memo.type!,
    content: memo.content!,
    completed: false,
    created_at: new Date().toISOString(),
    repeat_type: memo.repeat_type || RepeatType.NONE,
    reminder_time: memo.reminder_time || null,
    reminder_offsets: memo.reminder_offsets || null,
  };

  if (supabase) {
    try {
      const { data, error } = await supabase.from('memos').insert([newMemo]).select();
      if (!error && data) return data[0];
      if (error) console.error("Supabase Error:", error.message);
    } catch (e) { 
      console.error("클라우드 저장 실패", e); 
    }
  }

  const localMemos = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  const localNewMemo = { ...newMemo, id: 'local_' + Math.random().toString(36).substr(2, 9) } as Memo;
  localMemos.push(localNewMemo);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localMemos));
  return localNewMemo;
};

export const deleteMemoCloud = async (id: string): Promise<boolean> => {
  if (supabase && !id.startsWith('local_')) {
    try {
      const { error } = await supabase.from('memos').delete().eq('id', id);
      if (error) console.error("Supabase Delete Error:", error.message);
    } catch (e) {
      console.error("클라우드 삭제 실패", e);
    }
  }
  const localMemos = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localMemos.filter((m: any) => m.id !== id)));
  return true;
};

export const updateMemoCloud = async (id: string, updates: Partial<Memo>): Promise<boolean> => {
  const processedUpdates = { ...updates };
  if (updates.reminder_time === undefined) (processedUpdates as any).reminder_time = null;
  if (updates.reminder_offsets === undefined) (processedUpdates as any).reminder_offsets = null;

  if (supabase && !id.startsWith('local_')) {
    try {
      const { error } = await supabase.from('memos').update(processedUpdates).eq('id', id);
      if (error) console.error("Supabase Update Error:", error.message);
    } catch (e) {
      console.error("클라우드 업데이트 실패", e);
    }
  }
  const localMemos = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  const updated = localMemos.map((m: any) => m.id === id ? { ...m, ...processedUpdates } : m);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  return true;
};
