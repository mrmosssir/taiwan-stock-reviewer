import React, { useState } from 'react';
import { Key, Save, Eye, EyeOff } from 'lucide-react';

interface SettingsProps {
  apiKey: string;
  onSave: (key: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({ apiKey, onSave }) => {
  const [value, setValue] = useState(apiKey);
  const [show, setShow] = useState(false);

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex items-center gap-2 mb-4 text-gray-700 font-semibold">
        <Key size={20} />
        <h2>Fugle API 設定</h2>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="請輸入您的 Fugle API Key"
            className="w-full pl-4 pr-10 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          <button
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <button
          onClick={() => onSave(value)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Save size={18} />
          儲存
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        您的 API Key 將儲存在瀏覽器的 LocalStorage 中，不會上傳至任何伺服器。
      </p>
    </div>
  );
};
