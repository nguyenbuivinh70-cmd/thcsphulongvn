
import React, { useState, useEffect, useMemo } from 'react';
import { RowItem, SaveStatus } from '../types';
import { listRows, addRow, updateRow, deleteRow, listClasses } from '../services/api';

const DataEntryTab: React.FC = () => {
  const [rows, setRows] = useState<RowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<SaveStatus>({ type: 'idle' });
  const [deletingRowIndex, setDeletingRowIndex] = useState<number | null>(null);

  // Classes (LOP)
  const [classes, setClasses] = useState<string[]>(['']);
  const [loadingClasses, setLoadingClasses] = useState(false);

  // Form State
  const [editingRow, setEditingRow] = useState<RowItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cls: '',
    moneyDisplay: '' 
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await listRows();
      setRows(data);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Không thể tải danh sách dữ liệu.' });
    } finally {
      setLoading(false);
    }
  };

  const loadClasses = async () => {
    setLoadingClasses(true);
    try {
      const cls = await listClasses();
      setClasses(cls && cls.length ? cls : ['']);
    } catch (err) {
      console.error(err);
      setClasses(['']);
    } finally {
      setLoadingClasses(false);
    }
  };

  useEffect(() => {
    loadData();
    loadClasses();
  }, []);

  const formatWithDots = (val: string): string => {
    const raw = val.replace(/[^\d]/g, '');
    if (!raw) return '';
    return parseInt(raw).toLocaleString('vi-VN').replace(/,/g, '.');
  };

  const getRawNumber = (val: string): number => {
    return Number(val.replace(/[^\d]/g, '')) || 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'moneyDisplay') {
      setFormData(prev => ({ ...prev, moneyDisplay: formatWithDots(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: String(value || '') }));
    }
  };

  const classOptions = useMemo(() => {
    const base = Array.isArray(classes) ? classes.slice() : [''];
    const current = String(formData.cls || '').trim();
    if (current && !base.includes(current)) base.push(current);
    const unique = Array.from(new Set(base.map(x => String(x ?? ''))));
    if (!unique.includes('')) unique.unshift('');
    return unique.sort((a, b) => a.localeCompare(b, 'vi'));
  }, [classes, formData.cls]);

  /** 🚀 Sửa lỗi nút làm mới hoạt động triệt để */
  const resetForm = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setFormData({ name: '', cls: '', moneyDisplay: '' });
    setEditingRow(null);
    setStatus({ type: 'idle' });
  };

  /** 🚀 Cải thiện tốc độ bằng Optimistic Update */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const moneyNum = getRawNumber(formData.moneyDisplay) * 1000;

    if (!formData.name.trim()) {
      setStatus({ type: 'error', message: 'Vui lòng nhập họ và tên.' });
      return;
    }
    if (moneyNum <= 0) {
      setStatus({ type: 'error', message: 'Vui lòng nhập số tiền.' });
      return;
    }

    setStatus({ type: 'saving', message: 'Đang lưu...' });

    // Lưu trữ state cũ để hoàn tác nếu lỗi
    const oldRows = [...rows];

    try {
      if (editingRow) {
        // Cập nhật nhanh local state
        setRows(prev => prev.map(r => r.rowIndex === editingRow.rowIndex ? { ...r, name: formData.name, cls: formData.cls, money: moneyNum } : r));
        await updateRow({ ...editingRow, name: formData.name, cls: formData.cls, money: moneyNum });
        setStatus({ type: 'success', message: 'Đã cập nhật!' });
      } else {
        // Dự đoán STT mới (mục đích hiển thị nhanh)
        const nextStt = rows.length + 1;
        const tempRow: RowItem = { rowIndex: -1, stt: nextStt, name: formData.name, cls: formData.cls, money: moneyNum };
        setRows(prev => [...prev, tempRow]);
        
        await addRow({ name: formData.name, cls: formData.cls, money: moneyNum });
        setStatus({ type: 'success', message: 'Đã thêm!' });
      }
      
      setFormData({ name: '', cls: '', moneyDisplay: '' });
      setEditingRow(null);
      
      // Đồng bộ lại dữ liệu chuẩn từ server sau 1 giây để lấy rowIndex thực tế
      setTimeout(loadData, 1000);
      setTimeout(() => setStatus({ type: 'idle' }), 3000);
    } catch (err) {
      setRows(oldRows); // Hoàn tác nếu lỗi
      setStatus({ type: 'error', message: 'Lỗi khi gửi dữ liệu.' });
    }
  };

  const handleEdit = (row: RowItem) => {
    setEditingRow(row);
    const kValue = Math.floor(row.money / 1000);
    setFormData({
      name: row.name,
      cls: String(row.cls || ''),
      moneyDisplay: formatWithDots(kValue.toString())
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleActualDelete = async (rowIndex: number) => {
    const oldRows = [...rows];
    setRows(prev => prev.filter(r => r.rowIndex !== rowIndex)); // Xóa nhanh ở giao diện
    
    setStatus({ type: 'saving', message: 'Đang xóa...' });
    try {
      await deleteRow(rowIndex);
      setStatus({ type: 'success', message: 'Đã xóa!' });
      setTimeout(() => setStatus({ type: 'idle' }), 2000);
    } catch (err: any) {
      setRows(oldRows); // Hoàn tác nếu lỗi
      setStatus({ type: 'error', message: err?.message || 'Lỗi khi xóa.' });
    } finally {
      setDeletingRowIndex(null);
    }
  };

  const filteredRows = useMemo(() => {
    return rows.filter(r =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.cls && r.cls.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [rows, searchTerm]);

  const totalMoney = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (Number(r.money) || 0), 0);
  }, [filteredRows]);

  const handleExportExcel = () => {
    if (rows.length === 0) return;
    const now = new Date();
    const dateStr = `${now.getDate()}_${now.getMonth() + 1}_${now.getFullYear()}`;
    const fileName = `danh_sach_ung_ho_${dateStr}.xls`;

    const template = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <style>
          .header { background-color: #1e40af; color: #ffffff; font-weight: bold; border: 0.5pt solid #000000; text-align: center; }
          .text-cell { border: 0.5pt solid #000000; mso-number-format:"\@"; }
          .money { border: 0.5pt solid #000000; text-align: right; mso-number-format:"\#\,\#\#0"; }
          .stt { border: 0.5pt solid #000000; text-align: center; mso-number-format:"0"; }
          .total-label { font-weight: bold; border: 0.5pt solid #000000; background-color: #f1f5f9; text-align: right; }
          .total-value { font-weight: bold; border: 0.5pt solid #000000; background-color: #f1f5f9; text-align: right; color: #b91c1c; mso-number-format:"\#\,\#\#0"; }
        </style>
      </head>
      <body>
        <table border="1">
          <thead>
            <tr><th class="header">STT</th><th class="header">Họ và tên</th><th class="header">Lớp</th><th class="header">Số tiền (VNĐ)</th></tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td class="stt">${r.stt}</td>
                <td class="text-cell">${r.name}</td>
                <td class="text-cell">${r.cls || '-'}</td>
                <td class="money">${r.money}</td>
              </tr>
            `).join('')}
            <tr><td colspan="3" class="total-label">TỔNG CỘNG:</td><td class="total-value">${totalMoney}</td></tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([template], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = fileName;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = `
      <html>
        <head>
          <title>Danh sách ủng hộ</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f4f4f4; font-weight: bold; }
            h2 { text-align: center; }
            .total { text-align: right; font-weight: bold; font-size: 1.2em; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h2>DANH SÁCH ỦNG HỘ VĂN NGHỆ</h2>
          <table>
            <thead>
              <tr><th>STT</th><th>Họ và tên</th><th>Lớp</th><th style="text-align: right;">Số tiền</th></tr>
            </thead>
            <tbody>
              ${filteredRows.map(r => `
                <tr><td>${r.stt}</td><td>${r.name}</td><td>${r.cls || '-'}</td><td style="text-align: right;">${Number(r.money).toLocaleString('vi-VN')}đ</td></tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total">TỔNG CỘNG: ${totalMoney.toLocaleString('vi-VN')}đ</div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* 📝 FORM NHẬP LIỆU */}
        <div className="lg:col-span-4">
          <div className="bg-gray-800/80 backdrop-blur-xl p-8 rounded-[40px] border border-white/10 shadow-2xl sticky top-8">
            <div className="flex items-center gap-4 mb-8">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${editingRow ? 'bg-orange-500' : 'bg-blue-600'}`}>
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-white">{editingRow ? 'Sửa thông tin' : 'Nhập ủng hộ'}</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Họ và tên *</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 outline-none focus:border-blue-500/50 transition-all text-white font-bold" placeholder="Nhập tên..." autoComplete="off" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Số tiền (Nghìn đồng) *</label>
                <div className="relative group">
                  <input type="text" inputMode="numeric" name="moneyDisplay" value={formData.moneyDisplay} onChange={handleInputChange} className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 pr-16 outline-none focus:border-blue-500/50 transition-all text-white font-mono text-xl font-black" placeholder="Ví dụ: 200" />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-black text-sm pointer-events-none group-focus-within:text-blue-500 transition-colors">.000đ</div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Lớp (Text Format)</label>
                <select name="cls" value={formData.cls} onChange={handleInputChange} className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 outline-none focus:border-blue-500/50 transition-all text-white font-bold appearance-none cursor-pointer">
                  {classOptions.map((c) => (<option key={c || '__EMPTY__'} value={c} className="bg-gray-800">{c ? c : '— Không chọn —'}</option>))}
                </select>
              </div>
              <div className="pt-4 flex flex-col gap-3">
                <button type="submit" disabled={status.type === 'saving'} className={`w-full font-black py-4 rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-50 ${editingRow ? 'bg-orange-600 hover:bg-orange-500 shadow-orange-900/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'}`}>
                  {status.type === 'saving' ? 'ĐANG LƯU...' : editingRow ? 'CẬP NHẬT' : 'THÊM MỚI'}
                </button>
                <button type="button" onClick={resetForm} className="bg-white/5 hover:bg-white/10 py-4 rounded-2xl font-bold transition-all text-gray-400">LÀM MỚI FORM</button>
              </div>
              {status.message && (<div className={`text-sm p-4 rounded-2xl text-center font-black animate-in fade-in zoom-in duration-300 ${status.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{status.message}</div>)}
            </form>
          </div>
        </div>

        {/* 📋 DANH SÁCH CUỘN DỌC */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="bg-gray-800/50 backdrop-blur-md rounded-[40px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[820px]">
            <div className="p-8 border-b border-white/5 bg-white/5 flex flex-wrap items-center justify-between gap-6">
              <h3 className="text-xl font-black text-white">Danh sách ủng hộ</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <input type="text" placeholder="Tìm kiếm..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-black/40 border border-white/5 rounded-2xl px-5 py-3 pl-12 text-sm outline-none focus:border-blue-500/50 transition-all w-full md:w-64 font-medium" />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <button onClick={handlePrint} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-300 transition-all border border-white/5 group"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 00-2 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg></button>
                <button onClick={handleExportExcel} className="px-5 py-3 bg-emerald-600/10 hover:bg-emerald-600 rounded-2xl text-emerald-500 hover:text-white transition-all border border-emerald-500/10 flex items-center gap-2 group">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    <span className="text-xs font-black uppercase">Excel</span>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-900/50 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] sticky top-0 z-20 backdrop-blur-lg">
                  <tr>
                    <th className="p-6 border-b border-white/5 w-16 text-center">STT</th>
                    <th className="p-6 border-b border-white/5">Họ và tên</th>
                    <th className="p-6 border-b border-white/5">Lớp</th>
                    <th className="p-6 border-b border-white/5">Số tiền</th>
                    <th className="p-6 border-b border-white/5 w-24 text-center">Sửa/Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={5} className="p-32 text-center opacity-20"><p className="font-black text-xl italic uppercase tracking-widest">Không có dữ liệu</p></td></tr>
                  ) : 
                  filteredRows.map((row) => (
                    <tr key={row.rowIndex} className="hover:bg-white/5 transition-all group">
                      <td className="p-6 text-sm text-gray-600 text-center font-mono">{row.stt}</td>
                      <td className="p-6"><div className="font-bold text-white text-lg group-hover:text-blue-400 transition-colors">{row.name}</div></td>
                      <td className="p-6"><span className="px-3 py-1 bg-white/5 rounded-lg text-[10px] font-black text-gray-500 border border-white/5 uppercase">{row.cls || '-'}</span></td>
                      <td className="p-6"><div className="font-mono text-emerald-400 font-black text-xl">{Number(row.money).toLocaleString('vi-VN')}đ</div></td>
                      <td className="p-6">
                        <div className="flex items-center justify-center gap-2">
                          {deletingRowIndex === row.rowIndex ? (
                            <div className="flex gap-1 animate-in zoom-in duration-300">
                              <button onClick={() => handleActualDelete(row.rowIndex)} className="px-3 py-1.5 bg-red-600 text-[10px] font-black rounded-lg">XÓA</button>
                              <button onClick={() => setDeletingRowIndex(null)} className="px-3 py-1.5 bg-white/10 text-[10px] font-black rounded-lg">HỦY</button>
                            </div>
                          ) : (
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <button onClick={() => handleEdit(row)} className="p-2 bg-blue-500/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-xl"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2.5" /></svg></button>
                              <button onClick={() => setDeletingRowIndex(row.rowIndex)} className="p-2 bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white rounded-xl"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2.5" /></svg></button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-gray-900 border-t border-white/5 flex justify-between items-center z-20">
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Tổng cộng: {filteredRows.length} lượt</span>
              <div className="text-[10px] font-black text-emerald-500 uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Đồng bộ thực tế
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 📊 DASHBOARD DI CHUYỂN XUỐNG DƯỚI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-800 p-8 rounded-[40px] border border-white/10 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700"></div>
          <p className="text-blue-100 text-xs font-black uppercase tracking-widest mb-2 opacity-80">Tổng tiền đóng góp</p>
          <h3 className="text-4xl font-black text-white">{totalMoney.toLocaleString('vi-VN')}đ</h3>
        </div>
        <div className="bg-gray-800/40 backdrop-blur-md p-8 rounded-[40px] border border-white/5 shadow-xl">
          <p className="text-gray-500 text-xs font-black uppercase tracking-widest mb-2">Số lượt ủng hộ</p>
          <h3 className="text-4xl font-black text-white">{filteredRows.length}</h3>
        </div>
        <div className="bg-gray-800/40 backdrop-blur-md p-8 rounded-[40px] border border-white/5 shadow-xl">
          <p className="text-gray-500 text-xs font-black uppercase tracking-widest mb-2">Số lớp tham gia</p>
          <h3 className="text-4xl font-black text-white">{new Set(rows.map(r => r.cls).filter(Boolean)).size}</h3>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
};

export default DataEntryTab;
