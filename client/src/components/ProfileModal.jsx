import React, { useState } from 'react';
import { X, Loader2, AlertCircle, User, Phone, Lock } from 'lucide-react';
import api from '../middlewares/fetcher';

export const ProfileModal = ({ open, onClose, user, onSaved }) => {
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');

  if (!open) return null;

  const reset = () => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setCurrentPassword('');
    setNewPassword('');
    setErrors({});
    setServerError('');
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
    setTimeout(reset, 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const nextErrors = {};
    if (!name.trim()) nextErrors.name = 'Ism kiritilishi shart.';
    if (!phone.trim()) nextErrors.phone = 'Telefon kiritilishi shart.';
    if (newPassword && newPassword.length < 6) {
      nextErrors.newPassword = "Yangi parol kamida 6 belgi bo'lishi kerak.";
    }
    if (newPassword && !currentPassword) {
      nextErrors.currentPassword = 'Joriy parol kiritilishi shart.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
      };
      if (currentPassword) payload.currentPassword = currentPassword;
      if (newPassword) payload.newPassword = newPassword;

      const { data } = await api.patch('/auth/profile', payload);
      if (data?.data?.user) onSaved(data.data.user);
      handleClose();
    } catch (err) {
      setServerError(err.response?.data?.message || err.message || 'Xatolik yuz berdi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40 p-1 rounded-full hover:bg-gray-100" disabled={saving}>
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-1">Profilni yangilash</h2>
        <p className="text-sm text-gray-500 mb-6">Ma'lumotlaringizni yoki parolingizni yangilang.</p>

        {serverError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Ism</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full pl-9 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`}
                placeholder="Ismingiz"
              />
            </div>
            {errors.name && <p className="text-xs text-red-500 mt-1.5">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full pl-9 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition ${errors.phone ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`}
                placeholder="+998 90 123 45 67"
              />
            </div>
            {errors.phone && <p className="text-xs text-red-500 mt-1.5">{errors.phone}</p>}
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Parolni o'zgartirish</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Joriy parol</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition ${errors.currentPassword ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`}
                    placeholder="Joriy parol"
                    autoComplete="current-password"
                  />
                </div>
                {errors.currentPassword && <p className="text-xs text-red-500 mt-1.5">{errors.currentPassword}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Yangi parol</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition ${errors.newPassword ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`}
                    placeholder="Yangi parol (ixtiyoriy)"
                    autoComplete="new-password"
                  />
                </div>
                {errors.newPassword && <p className="text-xs text-red-500 mt-1.5">{errors.newPassword}</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={handleClose} disabled={saving} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium disabled:opacity-50">
              Bekor qilish
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-md shadow-blue-200 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Saqlash
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
