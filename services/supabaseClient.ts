
import { createClient } from '@supabase/supabase-js';
import { Memo, RepeatType } from '../types.ts';
import { parseISO, isSameDay, getDay, getDate, getMonth } from 'date-fns';
import { Lunar } from 'lunar-javascript';

/** 
 * [중요] 중학생 친구를 위한 안내:
 * 1. supabase.com에서 만든 Project URL을 아래 supabaseUrl에 붙여넣으세요.
 * 2. API Key (anon public)를 아래 supabaseAnonKey에 붙여넣으세요.
 */
const supabaseUrl = 'https://klarhvoglyapszhdwabp.supabase.co'; // 여기에 주소를 넣으세요!
const supabaseAnonKey = 'sb_publishable_uQl3IfjeLOz4_PA-o01rmA_fWh49XPE'; // 여기에 열쇠를 넣으세요!

// 주소와 열쇠가 제대로 입력되었는지 확인하는 깐깐한 검사기
export const isSupabaseConfigured = 
  supabaseUrl !== 'https://your-project-url.supabase.co' && 
  supabaseAnonKey !== 'your-anon-key-here';

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const LOCAL_STORAGE_KEY = 'daily_harmony_memos_v2';

// 클라우드에서 모든 메모 가져오기
export const fetchMemosFromCloud = async (userId: string = 'local_user'): Promise<Memo[]> => {
  if (!supabase) {
    console.log("로컬 모드로 작동 중입니다. (Supabase 설정 전)");
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  }

  try {
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // 클라우드 데이터를 로컬에도 저장해서 인터넷 안 될 때를 대비해요
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    return data || [];
  } catch (err) {
    console.error("클라우드 연결에 실패해서 로컬 데이터를 불러옵니다.");
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  }
};

// 특정 날짜에 맞는 메모 필터링 (기존 로직 유지)
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

// 메모 저장 (클라우드 우선, 안되면 로컬)
export const saveMemoCloud = async (memo: Partial<Memo>): Promise<Memo | null> => {
  const newMemo = {
    user_id: 'local_user',
    date: memo.date!,
    type: memo.type!,
    content: memo.content!,
    completed: false,
    created_at: new Date().toISOString(),
    repeat_type: memo.repeat_type || RepeatType.NONE,
    reminder_time: memo.reminder_time,
    reminder_offsets: memo.reminder_offsets,
  };

  if (supabase) {
    try {
      const { data, error } = await supabase.from('memos').insert([newMemo]).select();
      if (!error && data) return data[0];
    } catch (e) { console.error("클라우드 저장 실패"); }
  }

  // 로컬 저장 (백업용)
  const localMemos = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  const localNewMemo = { ...newMemo, id: 'local_' + Math.random().toString(36).substr(2, 9) } as Memo;
  localMemos.push(localNewMemo);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localMemos));
  return localNewMemo;
};

// 메모 삭제
export const deleteMemoCloud = async (id: string): Promise<boolean> => {
  if (supabase && !id.startsWith('local_')) {
    await supabase.from('memos').delete().eq('id', id);
  }
  const localMemos = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localMemos.filter((m: any) => m.id !== id)));
  return true;
};

// 메모 상태 업데이트
export const updateMemoCloud = async (id: string, updates: Partial<Memo>): Promise<boolean> => {
  if (supabase && !id.startsWith('local_')) {
    await supabase.from('memos').update(updates).eq('id', id);
  }
  const localMemos = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  const updated = localMemos.map((m: any) => m.id === id ? { ...m, ...updates } : m);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  return true;
};
