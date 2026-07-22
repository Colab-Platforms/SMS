import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import { Mail, Loader2, Send, Save, Settings, Check, X, Plus, Trash2 } from 'lucide-react';
import { notificationApi } from '@/services/notificationApi';
import { useToast } from '@/hooks/use-toast';
import { useNotificationStore } from '@/store/notificationStore';

interface EmailConfigProps {
  onConfigChange?: () => void;
}

interface EmailAddressRow {
  id: string;
  value: string;
}

interface EmailChannelConfig {
  email_addresses?: string[];
  email?: string;
  address?: string;
}

interface ConfigResponse {
  config?: EmailChannelConfig;
  is_active?: boolean;
}

interface TestNotificationResponse {
  results?: { recipient: string; success: boolean }[];
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const makeId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const toRows = (addresses: string[]): EmailAddressRow[] =>
  addresses.length > 0 ? addresses.map((value) => ({ id: makeId(), value })) : [{ id: makeId(), value: '' }];

// Prefer the new email_addresses array; fall back to a legacy single email/address string
// so an already-configured recipient isn't lost when this ships.
const resolveAddresses = (cfg?: EmailChannelConfig): string[] => {
  if (Array.isArray(cfg?.email_addresses)) return cfg.email_addresses.filter(Boolean);
  const legacy = cfg?.email || cfg?.address;
  return legacy ? [legacy] : [];
};

export const EmailConfig: React.FC<EmailConfigProps> = ({ onConfigChange }) => {
  const { t } = useTranslation('notification');
  const { toast } = useToast();

  const {
    channelConfigs,
    setEmailConfig,
    setChannelValidated
  } = useNotificationStore();

  const [rows, setRows] = useState<EmailAddressRow[]>(() => toRows(channelConfigs.email?.email_addresses || []));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isActive, setIsActive] = useState<boolean>(false);

  const rowValidity = useMemo(
    () => rows.map((row) => !row.value.trim() || emailRegex.test(row.value.trim())),
    [rows]
  );
  const nonBlankAddresses = useMemo(
    () => Array.from(new Set(rows.map((row) => row.value.trim()).filter(Boolean))),
    [rows]
  );
  const allValid = rowValidity.every(Boolean) && nonBlankAddresses.length > 0;

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await notificationApi.getChannelConfig('email');
      const configResponse = response as unknown as ConfigResponse;
      const addresses = resolveAddresses(configResponse?.config);

      setRows(toRows(addresses));
      setIsActive(Boolean(configResponse?.is_active));

      if (addresses.length > 0) {
        setEmailConfig({ email_addresses: addresses, validated: true });
        setChannelValidated('email', true);
      }
    } catch (error) {
      // 404 indicates channel not yet configured; keep local state
      setIsActive(false);
    } finally {
      setLoading(false);
    }
  }, [setEmailConfig, setChannelValidated]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

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
        title: t('errors.invalidEmail'),
        description: t('emailConfig.addressHelp'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      setEmailConfig({ email_addresses: nonBlankAddresses, validated: true });
      setChannelValidated('email', true);

      await notificationApi.configureChannel('email', { email_addresses: nonBlankAddresses });
      await loadConfig();

      toast({
        title: t('emailConfig.saved'),
        description: t('channelConfigured')
      });
      onConfigChange?.();
    } catch (error) {
      console.error('Failed to save email config:', error);
      toast({
        title: t('emailConfig.saveError'),
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
        title: t('errors.invalidEmail'),
        description: t('emailConfig.addressHelp'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setTesting(true);
      console.log('Testing email notification with addresses:', nonBlankAddresses);
      const response = await notificationApi.testNotification('email');
      console.log('Test email response:', response);
      const data = response as unknown as TestNotificationResponse;
      const succeeded = data?.results?.filter((r) => r.success).length ?? nonBlankAddresses.length;
      const total = data?.results?.length ?? nonBlankAddresses.length;

      toast({
        title: t('testSuccess'),
        description: `${succeeded}/${total}`,
      });
    } catch (error) {
      console.error('Failed to send test email:', error);
      toast({
        title: t('testFailed'),
        description: t('errors.sendFailed'),
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  const renderStatusBadge = () => {
    if (nonBlankAddresses.length === 0) {
      return <Badge variant="secondary">{t('channelNotConfigured')}</Badge>;
    }
    if (allValid) {
      return <Badge variant="default" className="bg-green-500">{t('configured')}</Badge>;
    }
    return <Badge variant="destructive">{t('errors.invalidEmail')}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {t('email')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isActive && (
          <Alert>
            <Settings className="h-4 w-4" />
            <AlertDescription className="flex items-center gap-2">
              <span>{t('emailConfig.active')}</span>
              {renderStatusBadge()}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>{t('emailConfig.addresses')}</Label>
          {rows.map((row, index) => (
            <div key={row.id} className="flex gap-2 items-center">
              <Input
                type="email"
                value={row.value}
                onChange={(e) => handleRowChange(row.id, e.target.value)}
                placeholder="user@example.com"
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
                aria-label={t('emailConfig.removeAddress')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={handleAddRow} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t('emailConfig.addAddress')}
          </Button>
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {t('emailConfig.addressHelp')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || loading || !allValid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('save')}
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!allValid || testing || loading}
            className="flex items-center gap-2"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t('test')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EmailConfig;
