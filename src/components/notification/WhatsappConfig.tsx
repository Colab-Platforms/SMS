import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Send, Check, X, MessageCircle, Settings, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notificationApi, WhatsappConfigStatus, WhatsappSessionStatus, ChannelCredentialsStatus } from '@/services/notificationApi';
import { useToast } from '@/hooks/use-toast';
import { useNotificationStore } from '@/store/notificationStore';

interface WhatsappConfigProps {
  onConfigChange?: () => void;
}

interface PhoneNumberRow {
  id: string;
  value: string;
}

interface WhatsappChannelConfig {
  phone_numbers: string[];
}

interface ConfigResponse {
  config?: WhatsappChannelConfig;
  is_active?: boolean;
}

interface TestNotificationResponse {
  results?: { recipient: string; success: boolean }[];
}

const phoneRegex = /^\+[1-9]\d{6,14}$/;

const makeId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const toRows = (numbers: string[]): PhoneNumberRow[] =>
  numbers.length > 0 ? numbers.map((value) => ({ id: makeId(), value })) : [{ id: makeId(), value: '' }];

export const WhatsappConfig: React.FC<WhatsappConfigProps> = ({ onConfigChange }) => {
  const { t } = useTranslation('notification');
  const { toast } = useToast();

  const {
    channelConfigs,
    setWhatsappConfig,
    setChannelValidated
  } = useNotificationStore();

  const [rows, setRows] = useState<PhoneNumberRow[]>(() => toRows(channelConfigs.whatsapp?.phone_numbers || []));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configStatus, setConfigStatus] = useState<WhatsappConfigStatus | null>(null);
  const [sessionStatus, setSessionStatus] = useState<WhatsappSessionStatus | null>(null);
  const [credentialsStatus, setCredentialsStatus] = useState<ChannelCredentialsStatus | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialsJustSaved, setCredentialsJustSaved] = useState(false);

  const rowValidity = useMemo(
    () => rows.map((row) => !row.value.trim() || phoneRegex.test(row.value.trim())),
    [rows]
  );
  const nonBlankNumbers = useMemo(
    () => Array.from(new Set(rows.map((row) => row.value.trim()).filter(Boolean))),
    [rows]
  );
  const allValid = rowValidity.every(Boolean) && nonBlankNumbers.length > 0;

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await notificationApi.getChannelConfig('whatsapp');
      const configResponse = response as unknown as ConfigResponse;
      const numbers = configResponse?.config?.phone_numbers || [];

      setRows(toRows(numbers));

      if (numbers.length > 0) {
        setWhatsappConfig({ phone_numbers: numbers, validated: true });
        setChannelValidated('whatsapp', true);
      }
    } catch (error) {
      // 404 indicates channel not yet configured; keep local state
    } finally {
      setLoading(false);
    }
  }, [setWhatsappConfig, setChannelValidated]);

  const loadStatus = useCallback(async () => {
    try {
      const [config, session] = await Promise.all([
        notificationApi.getWhatsappConfigStatus(),
        notificationApi.getWhatsappSessionStatus(),
      ]);
      setConfigStatus((config as unknown as WhatsappConfigStatus) || { configured: false, hasApiKey: false, isPlaceholder: true });
      setSessionStatus((session as unknown as WhatsappSessionStatus) || null);
    } catch (error) {
      console.error('Failed to load WhatsApp status:', error);
      setConfigStatus({ configured: false, hasApiKey: false, isPlaceholder: true });
      setSessionStatus(null);
    }
  }, []);

  const loadCredentialsStatus = useCallback(async () => {
    try {
      const status = await notificationApi.getChannelCredentialsStatus('whatsapp');
      setCredentialsStatus((status as unknown as ChannelCredentialsStatus) || { configured: false, hasApiKey: false });
    } catch (error) {
      console.error('Failed to load WhatsApp credentials status:', error);
      setCredentialsStatus({ configured: false, hasApiKey: false });
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadStatus();
    loadCredentialsStatus();
  }, [loadConfig, loadStatus, loadCredentialsStatus]);

  const handleSaveCredentials = async () => {
    if (!apiKeyInput.trim()) return;

    try {
      setSavingCredentials(true);
      await notificationApi.saveChannelCredentials('whatsapp', { api_key: apiKeyInput.trim() });
      setApiKeyInput('');
      setCredentialsJustSaved(true);
      await loadCredentialsStatus();
      await loadStatus();

      toast({
        title: t('credentials.credentialsSaved'),
      });
    } catch (error) {
      console.error('Failed to save WhatsApp credentials:', error);
      toast({
        title: t('credentials.credentialsSaveError'),
        variant: 'destructive'
      });
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleRowChange = (id: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, value } : row)));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, { id: makeId(), value: '' }]);
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const handleSave = async () => {
    if (!allValid) {
      toast({
        title: t('errors.invalidPhoneNumber'),
        description: t('phoneNumberHelp'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      setWhatsappConfig({ phone_numbers: nonBlankNumbers, validated: true });
      setChannelValidated('whatsapp', true);

      await notificationApi.configureChannel('whatsapp', { phone_numbers: nonBlankNumbers });
      await loadConfig();

      toast({
        title: t('whatsappConfigSaved'),
        description: t('channelConfigured'),
      });
      onConfigChange?.();
    } catch (error) {
      console.error('Failed to save WhatsApp config:', error);
      toast({
        title: t('whatsappConfigError'),
        description: t('errors.configSaveFailed'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!allValid) {
      toast({
        title: t('errors.invalidPhoneNumber'),
        description: t('phoneNumberHelp'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setTesting(true);
      const response = await notificationApi.testNotification('whatsapp');
      const data = response as unknown as TestNotificationResponse;
      const succeeded = data?.results?.filter((r) => r.success).length ?? nonBlankNumbers.length;
      const total = data?.results?.length ?? nonBlankNumbers.length;

      toast({
        title: t('testSuccess'),
        description: `${succeeded}/${total}`,
      });
    } catch (error) {
      console.error('Failed to send test WhatsApp message:', error);
      toast({
        title: t('testFailed'),
        description: t('errors.sendFailed'),
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  const getSessionBadge = () => {
    if (!sessionStatus?.status) {
      return <Badge variant="secondary">{t('notConfigured')}</Badge>;
    }
    if (sessionStatus.status === 'connected') {
      return <Badge variant="default" className="bg-green-500">{t(`sessionStatusValues.${sessionStatus.status}`)}</Badge>;
    }
    return <Badge variant="destructive">{t(`sessionStatusValues.${sessionStatus.status}`)}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          {t('whatsapp')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Session status */}
        <Alert>
          <Settings className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between gap-2">
              <span>{t('sessionStatus')}</span>
              {getSessionBadge()}
            </div>
          </AlertDescription>
        </Alert>

        {/* Configuration warning */}
        {configStatus && !configStatus.configured && (
          <Alert variant="destructive">
            <X className="h-4 w-4" />
            <AlertDescription>
              {t('errors.whatsappNotConfigured')}
            </AlertDescription>
          </Alert>
        )}

        {/* Provider credentials (WasenderAPI key) — separate from recipients below */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('credentials.apiKeyLabel')}</Label>
            {credentialsStatus?.configured ? (
              <Badge variant="default" className="bg-green-500">{t('configured')}</Badge>
            ) : (
              <Badge variant="secondary">{t('notConfigured')}</Badge>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <Input
              type="password"
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setCredentialsJustSaved(false);
              }}
              placeholder={t('credentials.apiKeyPlaceholder')}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveCredentials}
              disabled={savingCredentials || credentialsJustSaved || !apiKeyInput.trim()}
            >
              {savingCredentials ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('credentials.saveCredentials')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {t('credentials.apiKeyHelp')}
          </p>
        </div>

        {/* Phone number rows */}
        <div className="space-y-2">
          <Label>{t('phoneNumbers')}</Label>
          {rows.map((row, index) => (
            <div key={row.id} className="flex gap-2 items-center">
              <Input
                value={row.value}
                onChange={(e) => handleRowChange(row.id, e.target.value)}
                placeholder="+14155552671"
                disabled={loading}
              />
              {row.value.trim() && (
                rowValidity[index] ? (
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-red-500 shrink-0" />
                )
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveRow(row.id)}
                disabled={rows.length === 1}
                aria-label={t('removePhoneNumber')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={handleAddRow} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t('addPhoneNumber')}
          </Button>
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {t('phoneNumberHelp')}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || loading || !allValid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('save')}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || loading || !allValid}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t('test')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WhatsappConfig;
