
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays,
  parse,
  subMinutes
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  Lightbulb, 
  CalendarCheck, 
  ListTodo, 
  User, 
  Activity,
  Sparkles,
  Moon,
  Leaf,
  Bell,
  Clock,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  X,
  Download,
  Upload,
  Database,
  Cloud,
  CloudOff,
  RefreshCw,
  CalendarDays
} from 'lucide-react';
import { Lunar } from 'lunar-javascript';
import { Memo, MemoType, UserProfile, RepeatType, ReminderOffset } from './types.ts';
import { SOLAR_HOLIDAYS } from './constants.tsx';
import { 
  fetchMemosFromCloud, 
  getFilteredMemos, 
  saveMemoCloud, 
  deleteMemoCloud, 
  updateMemoCloud,
  isSupabaseConfigured 
} from './services/supabaseClient.ts';
import { calculateBiorhythm } from './services/biorhythmService.ts';
import { getDailyFortune } from './services/geminiService.ts';
import BiorhythmChart from './components/BiorhythmChart.tsx';
import ProfileSetup from './components/ProfileSetup.tsx';

const JIE_QI_MAP: Record<string, string> = {
  '立春': '입춘', '雨水': '우수', '驚蟄': '경칩', '春분': '춘분', '淸明': '청명', '穀雨': '곡우',
  '立夏': '입하', '소滿': '소만', '芒종': '망종', '夏至': '하지', '소暑': '소서', '大暑': '대서',
  '立秋': '입추', '處暑': '처서', '白露': '백로', '秋분': '추분', '寒露': '한로', '霜강': '상강',
  '立冬': '입동', '소雪': '소설', '大雪': '대설', '冬至': '동지', '소寒': '소한', '大寒': '대한'
};

const OFFSET_LABELS: { value: ReminderOffset, label: string }[] = [
  { value: ReminderOffset.AT_TIME, label: '정시' },
  { value: ReminderOffset.MIN_30, label: '30분 전' },
  { value: ReminderOffset.HOUR_1, label: '1시간 전' },
  { value: ReminderOffset.HOUR_2, label: '2시간 전' },
  { value: ReminderOffset.HOUR_3, label: '3시간 전' },
  { value: ReminderOffset.DAY_1, label: '1일 전' },
  { value: ReminderOffset.DAY_2, label: '2일 전' },
  { value: ReminderOffset.DAY_3, label: '3일 전' },
  { value: ReminderOffset.WEEK_1, label: '1주일 전' },
  { value: ReminderOffset.MONTH_1, label: '1달 전' },
];

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(() => {
    return process.env.API_KEY || localStorage.getItem('GEMINI_API_KEY') || '';
  });
  const [tempKey, setTempKey] = useState('');
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allMemos, setAllMemos] = useState<Memo[]>([]);
  const [loadingMemos, setLoadingMemos] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [newMemo, setNewMemo] = useState('');
  const [selectedType, setSelectedType] = useState<MemoType>(MemoType.TODO);
  
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [selectedOffsets, setSelectedOffsets] = useState<ReminderOffset[]>([ReminderOffset.AT_TIME]);
  const [showReminderOptions, setShowReminderOptions] = useState(false);
  
  // 편집 상태
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editReminderEnabled, setEditReminderEnabled] = useState(false);
  const [editReminderTime, setEditReminderTime] = useState('09:00');
  const [editSelectedOffsets, setEditSelectedOffsets] = useState<ReminderOffset[]>([]);

  const [showDataMenu, setShowDataMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataMenuRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('user_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [fortune, setFortune] = useState<string>('');
  const [loadingFortune, setLoadingFortune] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const lastNotificationDate = useRef<string | null>(localStorage.getItem('last_notif_date'));
  const notifiedMemos = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('notified_memos') || '[]')));

  const loadMemos = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingMemos(true);
    setIsSyncing(true);
    try {
      const data = await fetchMemosFromCloud();
      setAllMemos(data);
    } catch (error) {
      console.error("메모 로드 중 오류:", error);
    } finally {
      setLoadingMemos(false);
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dataMenuRef.current && !dataMenuRef.current.contains(event.target as Node)) {
        setShowDataMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExportData = () => {
    const data = {
      memos: JSON.stringify(allMemos),
      profile: localStorage.getItem('user_profile'),
      apiKey: localStorage.getItem('GEMINI_API_KEY'),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-harmony-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowDataMenu(false);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (confirm('설정 및 데이터를 불러오시겠습니까?')) {
          if (data.profile) localStorage.setItem('user_profile', data.profile);
          if (data.apiKey) localStorage.setItem('GEMINI_API_KEY', data.apiKey);
          alert('복원되었습니다.');
          window.location.reload();
        }
      } catch (err) {
        alert('유효하지 않은 백업 파일입니다.');
      }
    };
    reader.readAsText(file);
    setShowDataMenu(false);
  };

  useEffect(() => {
    const checkNotifications = () => {
      const now = new Date();
      const currentTimeStr = format(now, 'HH:mm');
      const todayStr = format(now, 'yyyy-MM-dd');

      if (profile?.notifications_enabled && currentTimeStr === profile.daily_reminder_time && lastNotificationDate.current !== todayStr) {
        const todayMemos = getFilteredMemos(allMemos, now);
        const todoCount = todayMemos.filter(m => m.type === MemoType.TODO && !m.completed).length;
        if (Notification.permission === 'granted') {
          new Notification('Daily Harmony', {
            body: `${profile.name}님, 오늘 할 일이 ${todoCount}개 있어요!`,
          });
          lastNotificationDate.current = todayStr;
          localStorage.setItem('last_notif_date', todayStr);
        }
      }

      if (Notification.permission === 'granted') {
        allMemos.forEach(memo => {
          if (!memo.reminder_time || !memo.reminder_offsets || memo.completed) return;
          const memoDate = parse(memo.date, 'yyyy-MM-dd', new Date());
          const [hours, minutes] = memo.reminder_time.split(':').map(Number);
          const memoDateTime = new Date(memoDate);
          memoDateTime.setHours(hours, minutes, 0, 0);
          memo.reminder_offsets.forEach(offset => {
            const notificationTime = subMinutes(memoDateTime, parseInt(offset));
            const notificationTimeStr = format(notificationTime, 'yyyy-MM-dd HH:mm');
            const nowStr = format(now, 'yyyy-MM-dd HH:mm');
            const notificationKey = `${memo.id}-${offset}-${notificationTimeStr}`;
            if (notificationTimeStr === nowStr && !notifiedMemos.current.has(notificationKey)) {
              new Notification('일정 알림', {
                body: `${memo.content}`,
              });
              notifiedMemos.current.add(notificationKey);
              localStorage.setItem('notified_memos', JSON.stringify(Array.from(notifiedMemos.current).slice(-100)));
            }
          });
        });
      }
    };
    const intervalId = setInterval(checkNotifications, 30000);
    return () => clearInterval(intervalId);
  }, [profile, allMemos]);

  const fetchFortune = useCallback(async () => {
    if (apiKey && profile) {
      setLoadingFortune(true);
      try {
        const result = await getDailyFortune(
          profile.birth_date, 
          profile.birth_time, 
          format(selectedDate, 'yyyy-MM-dd'),
          apiKey
        );
        setFortune(result);
      } catch (err) {
        setFortune("운세를 불러오지 못했습니다.");
      } finally {
        setLoadingFortune(false);
      }
    }
  }, [selectedDate, profile, apiKey]);

  useEffect(() => {
    fetchFortune();
  }, [fetchFortune]);

  const handleSaveApiKey = () => {
    if (tempKey.trim()) {
      localStorage.setItem('GEMINI_API_KEY', tempKey.trim());
      setApiKey(tempKey.trim());
      setTempKey('');
    }
  };

  const handleAddMemo = async () => {
    if (!newMemo.trim()) return;
    const added = await saveMemoCloud({
      date: format(selectedDate, 'yyyy-MM-dd'),
      type: selectedType,
      content: newMemo,
      repeat_type: RepeatType.NONE,
      reminder_time: reminderEnabled ? reminderTime : undefined,
      reminder_offsets: reminderEnabled ? selectedOffsets : undefined,
    });
    if (added) {
      setAllMemos(prev => [added, ...prev]);
      setNewMemo('');
      setReminderEnabled(false);
      setShowReminderOptions(false);
      setSelectedOffsets([ReminderOffset.AT_TIME]);
    }
  };

  const handleToggleOffset = (offset: ReminderOffset, isEdit: boolean = false) => {
    const current = isEdit ? editSelectedOffsets : selectedOffsets;
    const updated = current.includes(offset)
      ? current.filter(o => o !== offset)
      : [...current, offset];
    if (isEdit) setEditSelectedOffsets(updated);
    else setSelectedOffsets(updated);
  };

  const handleStartEdit = (memo: Memo) => {
    setEditingMemoId(memo.id);
    setEditContent(memo.content);
    setEditDate(memo.date);
    setEditReminderEnabled(!!memo.reminder_time);
    setEditReminderTime(memo.reminder_time || '09:00');
    setEditSelectedOffsets(memo.reminder_offsets || [ReminderOffset.AT_TIME]);
  };

  const handleSaveEdit = async () => {
    if (!editingMemoId) return;
    const success = await updateMemoCloud(editingMemoId, {
      content: editContent,
      date: editDate,
      reminder_time: editReminderEnabled ? editReminderTime : undefined,
      reminder_offsets: editReminderEnabled ? editSelectedOffsets : undefined,
    });
    if (success) {
      setEditingMemoId(null);
      // 서버에서 새로 데이터를 받아와 리스트를 갱신합니다.
      await loadMemos(false);
    }
  };

  const handleToggleMemo = async (id: string, currentStatus: boolean) => {
    const success = await updateMemoCloud(id, { completed: !currentStatus });
    if (success) {
      setAllMemos(prev => prev.map(m => m.id === id ? { ...m, completed: !currentStatus } : m));
    }
  };

  const handleDeleteMemo = async (id: string) => {
    if (confirm('정말로 이 기록을 삭제하시겠습니까?')) {
      const success = await deleteMemoCloud(id);
      if (success) {
        setAllMemos(prev => prev.filter(m => m.id !== id));
      }
    }
  };

  const currentDayMemos = getFilteredMemos(allMemos, selectedDate);

  const getDayDetails = useCallback((date: Date) => {
    const lunar = Lunar.fromDate(date);
    const mmdd = format(date, 'MM-dd');
    const holiday = SOLAR_HOLIDAYS[mmdd] || null;
    const rawJieQi = lunar.getJieQi() || null;
    const jieQi = rawJieQi ? (JIE_QI_MAP[rawJieQi] || rawJieQi) : null;
    let dynamicHoliday = null;
    const lm = lunar.getMonth(); const ld = lunar.getDay();
    if (lm === 1 && ld === 1) dynamicHoliday = '설날';
    else if (lm === 1 && ld === 2) dynamicHoliday = '설날 연휴';
    else if (lm === 4 && ld === 8) dynamicHoliday = '부처님오신날';
    else if (lm === 8 && ld === 15) dynamicHoliday = '추석';
    return { holiday, dynamicHoliday, jieQi, lunar };
  }, []);

  const renderCells = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const rows = [];
    let days = [];
    let day = startDate;
    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const { holiday, dynamicHoliday, jieQi, lunar } = getDayDetails(day);
        const isSunday = i === 0;
        const isSaturday = i === 6;
        const isHoliday = !!holiday || !!dynamicHoliday;
        const isSelected = isSameDay(day, selectedDate);
        const isToday = isSameDay(day, new Date());
        const dayMemos = getFilteredMemos(allMemos, day);
        days.push(
          <div key={day.toString()} className={`relative min-h-[95px] md:min-h-[125px] p-2 border-r border-b cursor-pointer transition-all duration-200 ${!isSameMonth(day, monthStart) ? "bg-gray-50/50 text-gray-300" : "text-gray-700 bg-white"} ${isSelected ? "bg-indigo-50/50 ring-2 ring-inset ring-indigo-500/20 z-10" : "hover:bg-gray-50"}`} onClick={() => setSelectedDate(cloneDay)}>
            <div className="flex justify-between items-start">
              <div className="flex flex-col items-center text-[10px] md:text-sm">
                <span className={`w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full transition-colors font-bold ${isSelected ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : ""} ${isToday && !isSelected ? "bg-gray-200 text-gray-800" : ""} ${(isSunday || isHoliday) && !isSelected ? "text-red-500" : ""} ${isSaturday && !isHoliday && !isSelected ? "text-blue-600" : ""}`}>{format(day, "d")}</span>
                <span className="text-[8px] md:text-[9px] text-gray-400 mt-0.5">{lunar.getMonth()}.{lunar.getDay()}</span>
              </div>
              <div className="flex flex-col items-end space-y-0.5 max-w-[60%]">
                {(holiday || dynamicHoliday) && <span className="text-[8px] md:text-[9px] text-red-500 font-black leading-tight text-right break-keep">{holiday || dynamicHoliday}</span>}
                {jieQi && <span className="flex items-center space-x-0.5 text-[8px] md:text-[9px] text-emerald-600 font-black"><Leaf size={8} /><span>{jieQi}</span></span>}
              </div>
            </div>
            <div className="mt-1 md:mt-2 space-y-0.5 md:space-y-1 overflow-hidden">
               {dayMemos.slice(0, 3).map((m: Memo, idx: number) => (
                 <div key={idx} className="flex items-center space-x-1">
                   <div className={`shrink-0 w-1 md:w-1.5 h-1 md:h-1.5 rounded-full ${m.type === MemoType.IDEA ? 'bg-amber-400' : m.type === MemoType.APPOINTMENT ? 'bg-rose-400' : 'bg-blue-400'}`} />
                   <span className={`text-[8px] md:text-[10px] text-gray-600 truncate font-medium ${m.completed ? 'line-through opacity-40' : ''}`}>{m.content}</span>
                 </div>
               ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="grid grid-cols-7" key={day.getTime()}>{days}</div>);
      days = [];
    }
    return <div className="border-t border-l rounded-2xl overflow-hidden bg-white shadow-xl shadow-gray-200/50">{rows}</div>;
  };

  const biorhythm = profile ? calculateBiorhythm(profile.birth_date, selectedDate) : null;
  const currentDayInfo = getDayDetails(selectedDate);

  const ReminderPicker = ({ offsets, onToggle }: { offsets: ReminderOffset[], onToggle: (o: ReminderOffset) => void }) => (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {OFFSET_LABELS.map((item) => (
        <label key={item.value} className={`flex items-center space-x-2 p-2 rounded-xl border transition-all cursor-pointer ${offsets.includes(item.value) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'}`}>
          <input 
            type="checkbox" 
            checked={offsets.includes(item.value)} 
            onChange={() => onToggle(item.value)}
            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300" 
          />
          <span className="text-[10px] font-bold">{item.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-12 animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-4 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-2xl border border-gray-100/50 text-[10px] md:text-xs">
         <div className="flex items-center space-x-3">
           <div className={`flex items-center space-x-1.5 font-bold ${isSupabaseConfigured ? 'text-emerald-600' : 'text-amber-500'}`}>
             {isSupabaseConfigured ? <Cloud size={14} /> : <CloudOff size={14} />}
             <span>{isSupabaseConfigured ? '클라우드 동기화 중' : '로컬 저장 모드'}</span>
           </div>
           {isSyncing && <RefreshCw size={12} className="animate-spin text-indigo-400" />}
         </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 space-y-6 md:space-y-0 relative z-40">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tighter">
            {format(currentDate, 'yyyy년 MM월')}
          </h2>
          <div className="flex items-center space-x-1 bg-white rounded-xl shadow-sm border border-gray-100 p-1">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1.5 md:p-2 hover:bg-gray-50 rounded-lg"><ChevronLeft size={18} /></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-[10px] md:text-xs font-bold text-indigo-600">오늘</button>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1.5 md:p-2 hover:bg-gray-50 rounded-lg"><ChevronRight size={18} /></button>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="relative" ref={dataMenuRef}>
            <button onClick={() => setShowDataMenu(!showDataMenu)} className="p-3 bg-white border border-gray-100 text-gray-400 rounded-2xl shadow-sm hover:text-indigo-600"><Database size={20} /></button>
            {showDataMenu && (
              <div className="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-[100] animate-in slide-in-from-top-2">
                <button onClick={handleExportData} className="w-full flex items-center space-x-3 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"><Download size={16} /><span>백업하기</span></button>
                <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center space-x-3 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"><Upload size={16} /><span>불러오기</span></button>
                <input type="file" ref={fileInputRef} onChange={handleImportData} accept=".json" className="hidden" />
              </div>
            )}
          </div>
          <button onClick={() => setShowProfileModal(true)} className="flex items-center space-x-2 bg-white border border-gray-100 text-gray-700 px-5 py-3 rounded-2xl shadow-sm font-bold text-sm">
            <User size={18} className="text-indigo-500" /><span>{profile ? profile.name : '프로필 설정'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-30">
        <div className="lg:col-span-8">
          <div className="bg-white rounded-3xl p-3 md:p-6 shadow-xl border border-gray-50">
            <div className="min-w-[320px]">
              <div className="grid grid-cols-7 mb-2 border-b pb-2">
                {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
                  <div key={day} className={`text-center font-bold text-[10px] md:text-xs ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>{day}</div>
                ))}
              </div>
              {renderCells()}
            </div>
          </div>
          {profile && (
            <div className="mt-8 bg-white rounded-3xl shadow-xl p-6 md:p-8 border border-gray-50">
              <div className="flex items-center space-x-2 mb-6"><Activity className="text-indigo-600" size={24} /><h3 className="text-xl font-black">바이오리듬</h3></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <BiorhythmChart birthDate={profile.birth_date} targetDate={selectedDate} />
                <div className="space-y-2">
                  {[{ label: '신체', val: biorhythm?.physical, color: 'blue' }, { label: '감성', val: biorhythm?.emotional, color: 'rose' }, { label: '지성', val: biorhythm?.intellectual, color: 'emerald' }].map((item) => (
                    <div key={item.label} className={`p-4 bg-${item.color}-50/50 rounded-2xl border border-${item.color}-100 flex justify-between items-center`}>
                      <span className={`text-${item.color}-700 font-bold text-sm`}>{item.label}</span>
                      <span className={`text-${item.color}-800 font-black text-lg`}>{Math.round(item.val || 0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
            <p className="text-indigo-200 text-sm font-bold tracking-widest">{format(selectedDate, 'yyyy')}</p>
            <h2 className="text-4xl font-black">{format(selectedDate, 'M월 d일')}</h2>
            <div className="flex items-center space-x-3 mt-4">
              <div className="bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-black">{format(selectedDate, 'EEEE', { locale: ko })}</div>
              <div className="flex items-center space-x-1.5 text-indigo-100 font-bold text-xs"><Moon size={14} /><span>음력 {currentDayInfo.lunar.getMonth()}.{currentDayInfo.lunar.getDay()}</span></div>
            </div>
            <Moon className="absolute -right-8 -bottom-8 text-white opacity-10 rotate-12" size={180} />
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-7 border border-gray-50 min-h-[120px]">
            <div className="flex items-center space-x-2 mb-5"><Sparkles className="text-indigo-500" size={18} /><h3 className="text-lg font-black">오늘의 AI 운세</h3></div>
            {!apiKey ? (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">운세를 위해 Gemini API 키가 필요합니다.</p>
                <div className="flex gap-2">
                  <input type="password" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="API 키 입력" className="flex-1 bg-gray-50 rounded-xl px-4 py-2 text-xs" />
                  <button onClick={handleSaveApiKey} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold">연결</button>
                </div>
              </div>
            ) : loadingFortune ? (
              <div className="animate-pulse space-y-2"><div className="h-4 bg-gray-100 rounded w-3/4"></div><div className="h-4 bg-gray-100 rounded w-full"></div></div>
            ) : <div className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap font-medium">{fortune}</div>}
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-7 border border-gray-50">
            <h3 className="text-sm font-black mb-4 flex items-center space-x-2"><CalendarIcon size={16} className="text-indigo-600" /><span>기록 추가</span></h3>
            <div className="flex gap-2 mb-5 overflow-x-auto pb-2 scrollbar-hide">
              {[[MemoType.TODO, ListTodo, '할일'], [MemoType.IDEA, Lightbulb, '아이디어'], [MemoType.APPOINTMENT, CalendarCheck, '약속']].map(([type, Icon, label]: any) => (
                <button key={type} onClick={() => setSelectedType(type)} className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-[10px] font-black transition-all shrink-0 ${selectedType === type ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                  <Icon size={12} /><span>{label}</span>
                </button>
              ))}
            </div>
            <div className="space-y-4">
              <div className="relative">
                <input type="text" value={newMemo} onChange={(e) => setNewMemo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddMemo()} placeholder="무엇을 기록할까요?" className="w-full bg-gray-50 rounded-2xl py-4 pl-5 pr-14 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all" />
                <button onClick={handleAddMemo} className="absolute right-2.5 top-2.5 p-2 bg-indigo-600 text-white rounded-xl shadow-lg"><Plus size={20} /></button>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between">
                  <button onClick={() => setShowReminderOptions(!showReminderOptions)} className="flex items-center space-x-2 text-xs font-bold text-gray-600">
                    <Bell size={14} className={reminderEnabled ? "text-indigo-500" : "text-gray-400"} />
                    <span>알림 설정</span> {showReminderOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => setReminderEnabled(!reminderEnabled)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${reminderEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}><span className={`h-3 w-3 bg-white rounded-full transition-transform ${reminderEnabled ? 'translate-x-5' : 'translate-x-1'}`} /></button>
                </div>
                {reminderEnabled && showReminderOptions && (
                  <div className="mt-4 animate-in slide-in-from-top-1">
                    <div className="flex items-center gap-3 mb-3"><Clock size={14} className="text-gray-400" /><input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className="bg-white rounded-lg px-3 py-1 text-xs font-bold border-none" /></div>
                    <p className="text-[10px] font-bold text-gray-400 mb-2">언제 알려드릴까요? (중복 선택 가능)</p>
                    <ReminderPicker offsets={selectedOffsets} onToggle={(o) => handleToggleOffset(o, false)} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-7 border border-gray-50 min-h-[300px]">
            <h3 className="text-lg font-black mb-6">오늘의 기록</h3>
            <div className="space-y-3">
              {currentDayMemos.length === 0 ? (
                <div className="text-center py-10 opacity-30"><ListTodo size={40} className="mx-auto mb-2" /><p className="text-sm font-bold">기록이 없습니다.</p></div>
              ) : currentDayMemos.map((memo) => (
                <div key={memo.id} className={`group bg-white border p-4 rounded-2xl transition-all ${editingMemoId === memo.id ? 'border-indigo-500 ring-4 ring-indigo-50 shadow-inner' : 'border-gray-50 hover:border-indigo-100'}`}>
                  {editingMemoId === memo.id ? (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-2xl">
                          <CalendarDays size={18} className="text-indigo-500 shrink-0" />
                          <input 
                            type="date" 
                            value={editDate} 
                            onChange={(e) => setEditDate(e.target.value)} 
                            className="flex-1 bg-transparent text-indigo-700 text-sm font-black border-none focus:ring-0 p-0" 
                          />
                        </div>
                        <input 
                          type="text" 
                          value={editContent} 
                          onChange={(e) => setEditContent(e.target.value)} 
                          className="w-full bg-gray-50 rounded-2xl px-4 py-4 text-sm font-bold focus:bg-white border-none focus:ring-2 focus:ring-indigo-100 transition-all" 
                          placeholder="수정할 내용을 입력하세요"
                        />
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <Bell size={14} className={editReminderEnabled ? "text-indigo-500" : "text-gray-400"} />
                             <span className="text-xs font-bold text-gray-600">알림 예약</span>
                          </div>
                          <button onClick={() => setEditReminderEnabled(!editReminderEnabled)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${editReminderEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}><span className={`h-3 w-3 bg-white rounded-full transition-transform ${editReminderEnabled ? 'translate-x-5' : 'translate-x-1'}`} /></button>
                        </div>
                        {editReminderEnabled && (
                          <div className="animate-in slide-in-from-top-1">
                             <div className="flex items-center gap-3 mb-3"><Clock size={14} className="text-gray-400" /><input type="time" value={editReminderTime} onChange={(e) => setEditReminderTime(e.target.value)} className="bg-white rounded-lg px-3 py-1 text-xs font-bold border-none" /></div>
                             <ReminderPicker offsets={editSelectedOffsets} onToggle={(o) => handleToggleOffset(o, true)} />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-3 pt-2">
                        <button onClick={handleSaveEdit} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl text-sm font-black shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all"><Check size={18} />저장</button>
                        <button onClick={() => setEditingMemoId(null)} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-all"><X size={18} />취소</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button onClick={() => handleToggleMemo(memo.id, memo.completed)} className="mt-1 shrink-0">{memo.completed ? <CheckCircle2 className="text-emerald-500" size={20} /> : <Circle className="text-gray-200" size={20} />}</button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${memo.completed ? 'text-gray-300 line-through font-medium' : 'text-gray-700'}`}>{memo.content}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${memo.type === MemoType.IDEA ? 'bg-amber-100 text-amber-700' : memo.type === MemoType.APPOINTMENT ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{memo.type}</span>
                            {memo.reminder_time && (
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[9px] font-black">
                                <Bell size={8} /><span>{memo.reminder_time}</span>
                                {memo.reminder_offsets?.map(off => (
                                  <span key={off} className="border-l border-indigo-200 pl-1">{OFFSET_LABELS.find(l => l.value === off)?.label.replace(' 전', '')}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleStartEdit(memo)} className="p-2 text-gray-300 hover:text-indigo-500"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteMemo(memo.id)} className="p-2 text-gray-300 hover:text-rose-500"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showProfileModal && (
        <ProfileSetup 
          onSave={(newProfile) => {
            setProfile(newProfile);
            localStorage.setItem('user_profile', JSON.stringify(newProfile));
            setShowProfileModal(false);
          }} 
          onClose={() => setShowProfileModal(false)}
          currentProfile={profile}
        />
      )}
    </div>
  );
};

export default App;
