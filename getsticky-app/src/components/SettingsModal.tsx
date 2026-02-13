import { useState, useEffect, useRef } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  maskedApiKey: string;
  onSave: (settings: { agentName?: string; apiKey?: string }) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  agentName,
  maskedApiKey,
  onSave,
}: SettingsModalProps) {
  const [name, setName] = useState(agentName);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(agentName);
    setApiKey('');
    setSaved(false);
  }, [agentName, isOpen]);

  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const updates: { agentName?: string; apiKey?: string } = {};
    if (name !== agentName) updates.agentName = name;
    if (apiKey.trim()) updates.apiKey = apiKey.trim();

    if (Object.keys(updates).length > 0) {
      onSave(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)',
          border: '1px solid #2d3748',
          borderRadius: '16px',
          padding: '32px',
          width: '420px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              color: '#e2e8f0',
            }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Agent Name */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px',
            }}
          >
            Agent Name
          </label>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Claude"
            style={{
              width: '100%',
              background: '#0f1419',
              border: '1px solid #2d3748',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '14px',
              color: '#e2e8f0',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#2d3748')}
          />
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              marginTop: '4px',
            }}
          >
            Displayed as the responder in agent responses and comments
          </div>
        </div>

        {/* API Key */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px',
            }}
          >
            Agent API Key
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={maskedApiKey || 'sk-ant-...'}
              style={{
                width: '100%',
                background: '#0f1419',
                border: '1px solid #2d3748',
                borderRadius: '8px',
                padding: '10px 44px 10px 14px',
                fontSize: '14px',
                color: '#e2e8f0',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#2d3748')}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: '4px',
              }}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              marginTop: '4px',
            }}
          >
            Stored locally in SQLite (plaintext). Do not share the DB file.
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #2d3748',
              color: '#94a3b8',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              background: saved
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none',
              color: '#ffffff',
              padding: '8px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: saved
                ? '0 2px 8px rgba(16, 185, 129, 0.3)'
                : '0 2px 8px rgba(99, 102, 241, 0.3)',
            }}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
