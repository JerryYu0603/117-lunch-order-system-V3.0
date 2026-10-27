import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Camera, Info, Trash2, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Order {
  id: string;
  seat_number: number;
  meal_id: string;
  price: number;
  status: string;
  creator_seat: number;
  payer_seat: number | null;
}

interface Settings {
  announcement: string;
  ig_account: string;
  menu_options: { [key: string]: boolean };
}

export default function Home() {
  const navigate = useNavigate();
  const [currentUserSeat, setCurrentUserSeat] = useState<number | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings>({
    announcement: '請在每日上午10:20前訂完餐。每份 85 元。錢錢交到後面36號的櫃子',
    ig_account: '117_lunch_vendor',
    menu_options: { A: true, B: true, C: true, D: true }
  });
  const [isCutoff, setIsCutoff] = useState(false);
  const [targetSeat, setTargetSeat] = useState('');
  const [selectedMeal, setSelectedMeal] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const FIXED_PRICE = 85;

  // 讀取最新訂單
  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase.from('today_orders_view').select('*').order('seat_number', { ascending: true });
    if (!error && data) setOrders(data);
  }, []);

  // 讀取最新設定與檢查截止時間
  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('daily_settings')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setSettings({
        announcement: data.announcement,
        ig_account: data.ig_account || '',
        menu_options: data.menu_options || { A: true, B: true, C: true, D: true }
      });
    }

    // 檢查後端 10:20 截止狀態
    const { data: cutoffData } = await supabase.rpc('is_order_cutoff');
    setIsCutoff(!!cutoffData);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    if (!token) {
      navigate('/');
      return;
    }
    setSessionToken(token);
    
    supabase.rpc('get_session_seat', { p_session_id: token }).then(({ data, error }) => {
      if (error || !data) handleLogout();
      else {
        setCurrentUserSeat(data);
        fetchOrders();
        fetchSettings();
      }
    });

    // 🌟 1. Realtime 即時廣播
    const channel = supabase
      .channel('orders_realtime_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_settings' }, () => {
        fetchSettings();
      })
      .subscribe();

    // 🌟 2. 自動輪詢計時器：每 10 秒檢查一次時間，確保 10:20 一到畫面主動鎖定
    const timer = setInterval(() => {
      fetchSettings();
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [navigate, fetchOrders, fetchSettings]);

  const handleLogout = async () => {
    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    if (token) supabase.from('sessions').delete().eq('id', token).then();
    localStorage.removeItem('session_token');
    sessionStorage.removeItem('session_token');
    navigate('/');
  };

  const handleSubmitOrder = async () => {
    if (isCutoff) return alert('已停止接收新訂單');
    if (!selectedMeal) return alert('請先選擇餐點');
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('submit_order', {
        p_session_id: sessionToken,
        p_target_seat: targetSeat ? parseInt(targetSeat) : null,
        p_meal_id: selectedMeal
      });
      if (error) throw new Error(error.message);
      setSelectedMeal('');
      setTargetSeat('');
      fetchOrders();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (isCutoff) return alert('已超過 10:20，無法刪除訂單');
    if (!window.confirm('確定要刪除這筆訂單嗎？')) return;
    try {
      const { error } = await supabase.rpc('delete_order', { p_session_id: sessionToken, p_order_id: orderId });
      if (error) throw new Error(error.message);
      fetchOrders();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePayOrder = async (orderId: string) => {
    if (!window.confirm('確認付款？\n付款後將無法刪除訂單，10:20前仍可修改餐點。')) return;
    try {
      const { error } = await supabase.rpc('pay_order', { p_session_id: sessionToken, p_order_id: orderId });
      if (error) throw new Error(error.message);
      fetchOrders();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const myRelatedOrders = orders.filter(o => o.seat_number === currentUserSeat || o.creator_seat === currentUserSeat);
  const totalCount = orders.length;
  const totalPrice = totalCount * FIXED_PRICE;
  const paidCount = orders.filter(o => o.status === 'PAID').length;
  const paidAmount = paidCount * FIXED_PRICE;
  const getMealCount = (meal: string) => orders.filter(o => o.meal_id === meal).length;

  if (!currentUserSeat) return <div className="p-10 text-center text-slate-500">載入中...</div>;

  return (
    <div className="pb-10">
      <header className="bg-blue-600 text-white p-4 flex justify-between items-center sticky top-0 z-10 shadow-md">
        <h1 className="font-bold text-xl">117 訂餐系統</h1>
        <div className="flex items-center gap-4">
          <span className="font-medium bg-blue-500 px-3 py-1 rounded-full text-sm">座號 {currentUserSeat}</span>
          <button onClick={handleLogout} className="p-1"><LogOut size={20} /></button>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* 10:20 截止提示條 */}
        {isCutoff ? (
          <div className="bg-red-500 text-white p-4 rounded-xl text-center font-bold flex justify-center items-center gap-2 shadow">
            <Clock size={20} /> 已停止接收新訂單 (今日 10:20 已截止)
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 text-sm flex gap-3">
            <Info className="shrink-0" size={20} />
            <p>{settings.announcement}</p>
          </div>
        )}

        {/* IG 廠商動態 */}
        {settings.ig_account && (
          <section className="bg-white border rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera size={20} className="text-pink-600" />
                <span className="font-bold text-slate-800">駐校廠商最新菜單</span>
              </div>
              <a href={`https://instagram.com/${settings.ig_account}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 flex items-center gap-1 font-medium bg-blue-50 px-2.5 py-1 rounded-full">
                @{settings.ig_account} <ExternalLink size={12} />
              </a>
            </div>
            <div className="w-full overflow-hidden rounded-xl border bg-slate-50 flex justify-center">
              <iframe
                src={`https://www.instagram.com/${settings.ig_account}/embed`}
                className="w-full h-[380px] border-0"
                scrolling="no"
                allowTransparency={true}
                title="Instagram Menu Post"
              />
            </div>
          </section>
        )}

        {/* 訂餐表單 */}
        <section className="bg-white border rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-bold mb-4">今日點餐</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 text-slate-700">代訂座號 (選填)</label>
            <input
              type="number"
              value={targetSeat}
              onChange={(e) => setTargetSeat(e.target.value)}
              placeholder="留空代表幫自己訂"
              disabled={isCutoff}
              className="w-full p-3 border rounded-xl bg-slate-50 disabled:bg-slate-100"
              min="1" max="28"
            />
            <p className="text-xs text-slate-500 mt-1">填入其他有效座號代表幫該同學訂餐</p>
          </div>

          <div className="space-y-3 mb-6">
            {['A', 'B', 'C', 'D'].filter(m => settings.menu_options[m as keyof typeof settings.menu_options] !== false).map((meal) => (
              <label key={meal} className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${selectedMeal === meal ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <input type="radio" name="meal" value={meal} disabled={isCutoff} checked={selectedMeal === meal} onChange={(e) => setSelectedMeal(e.target.value)} className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-lg">{meal} 餐</span>
                  <span className="text-sm text-slate-500">(85 元)</span>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">已 {getMealCount(meal)} 人選</span>
              </label>
            ))}
          </div>
          
          <button onClick={handleSubmitOrder} disabled={isLoading || isCutoff} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl text-lg active:bg-blue-700 disabled:bg-slate-300">
            {isCutoff ? '已截止訂餐' : (isLoading ? '處理中...' : '送出訂單')}
          </button>
        </section>

        {/* 你的訂單 */}
        <section>
          <h2 className="text-lg font-bold mb-3 px-1">你的訂單與代訂</h2>
          {myRelatedOrders.length === 0 ? (
            <p className="text-sm text-slate-400 px-1">尚未建立任何訂單</p>
          ) : (
            <div className="space-y-3">
              {myRelatedOrders.map(order => (
                <div key={order.id} className="bg-white border rounded-2xl p-4 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-slate-800 text-white text-xs px-2 py-1 rounded">座號 {order.seat_number}</span>
                      <span className="font-bold text-lg">{order.meal_id} 餐</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {order.creator_seat !== order.seat_number && `(由 ${order.creator_seat} 號代訂) `}
                      {order.status === 'PAID' ? <span className="text-green-600 font-bold">已付款</span> : '未付款'}
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    {order.status === 'UNPAID' && (
                      <>
                        {!isCutoff && (
                          <button onClick={() => handleDeleteOrder(order.id)} className="p-2 text-red-500 bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                        )}
                        <button onClick={() => handlePayOrder(order.id)} className="px-3 py-2 text-sm font-bold text-white bg-green-500 rounded-lg">確認付款</button>
                      </>
                    )}
                    {order.status === 'PAID' && (
                      <span className="flex items-center gap-1 text-green-600 text-sm font-bold bg-green-50 px-3 py-2 rounded-lg">
                        <CheckCircle size={16} /> 完成
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 班級總表 */}
        <section>
          <h2 className="text-lg font-bold mb-3 px-1">今日班級總表</h2>
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-3 font-medium">座號</th>
                    <th className="p-3 font-medium">餐點</th>
                    <th className="p-3 font-medium">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-400">目前尚無訂單</td></tr>}
                  {orders.map(order => (
                    <tr key={order.id}>
                      <td className="p-3 font-mono">{order.seat_number.toString().padStart(2, '0')}</td>
                      <td className="p-3 font-bold">{order.meal_id}</td>
                      <td className={`p-3 font-medium ${order.status === 'PAID' ? 'text-green-600' : 'text-red-500'}`}>
                        {order.status === 'PAID' ? '已付款' : '未付'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 p-4 border-t grid grid-cols-2 gap-y-2 text-xs text-slate-700">
              <p>總份數：<span className="font-bold">{totalCount}</span></p>
              <p>總金額：<span className="font-bold">{totalPrice}</span> 元</p>
              <p>已付款：<span className="font-bold text-green-600">{paidAmount}</span> 元</p>
              <p>未付款：<span className="font-bold text-red-500">{totalPrice - paidAmount}</span> 元</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
