import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [seat, setSeat] = useState('');
  const [remember, setRemember] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();

  // 檢查是否已有登入 Session
  useEffect(() => {
    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    if (token) {
      supabase.rpc('get_session_seat', { p_session_id: token }).then(({ data, error }) => {
        if (data && !error) navigate('/home');
      });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (isRegister) {
        if (pin !== pinConfirm) throw new Error('兩次輸入的 PIN 碼不一致');
        const { error } = await supabase.rpc('register_pin', { 
          p_seat: parseInt(seat), 
          p_pin: pin 
        });
        if (error) throw new Error(error.message);
        
        alert('註冊成功！請直接登入。');
        setIsRegister(false);
        setPin(''); setPinConfirm('');
      } else {
        const { data: sessionId, error } = await supabase.rpc('login_pin', { 
          p_pin: pin, 
          p_remember: remember 
        });
        if (error) throw new Error(error.message);
        
        // 將安全 Token 存入前端，不存真實密碼
        if (remember) localStorage.setItem('session_token', sessionId);
        else sessionStorage.setItem('session_token', sessionId);
        
        navigate('/home');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '發生未知錯誤');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-6 justify-center">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-blue-600 mb-2">117 午餐訂餐系統</h1>
        <p className="text-slate-500">每天準時吃飯，才有力氣學習！</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && <div className="bg-red-100 text-red-700 p-3 rounded-xl text-sm text-center">{errorMsg}</div>}
        
        {isRegister && (
          <div>
            <label className="block text-sm font-medium mb-1">你的座號 (1-28)</label>
            <input type="number" value={seat} onChange={(e) => setSeat(e.target.value)} className="w-full text-2xl p-3 border rounded-xl bg-slate-50 text-center" placeholder="例如: 15" required min="1" max="28" />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">{isRegister ? '設定 6 位數 PIN 碼' : '請輸入 PIN 碼登入'}</label>
          <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full text-3xl tracking-widest p-3 border rounded-xl bg-slate-50 text-center font-mono" placeholder="••••••" minLength={6} maxLength={6} required />
        </div>

        {isRegister && (
          <div>
            <label className="block text-sm font-medium mb-1">再次確認 PIN 碼</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)} className="w-full text-3xl tracking-widest p-3 border rounded-xl bg-slate-50 text-center font-mono" placeholder="••••••" minLength={6} maxLength={6} required />
          </div>
        )}

        {!isRegister && (
          <div className="flex items-center">
            <input type="checkbox" id="remember" checked={remember} onChange={(e)=>setRemember(e.target.checked)} className="w-5 h-5 rounded text-blue-600" />
            <label htmlFor="remember" className="ml-2 text-slate-600">記住我</label>
          </div>
        )}

        <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold text-lg p-4 rounded-xl active:bg-blue-700 disabled:bg-blue-400 mt-2">
          {isLoading ? '處理中...' : (isRegister ? '註冊' : '登入')}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button onClick={() => { setIsRegister(!isRegister); setErrorMsg(''); }} className="text-blue-500 font-medium p-2">
          {isRegister ? '已有 PIN 碼？點此登入' : '還沒設定 PIN 碼？點此註冊'}
        </button>
      </div>
      <div className="mt-auto pt-8 text-center">
        <button onClick={() => navigate('/admin')} className="text-xs text-slate-400">管理員後台入口</button>
      </div>
    </div>
  );
}