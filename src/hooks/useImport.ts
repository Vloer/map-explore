import { useState, useRef } from 'react';
import { databaseService } from '../services/DatabaseService';
import type { ImportOptions, TimelineData } from '../types';

export function useImport(onImportComplete: () => void) {
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [pendingData, setPendingData] = useState<TimelineData | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        setPendingData(data);
        setShowImportModal(true);
      } catch (err) {
        setLoading(false);
        setImportStatus('Error parsing file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const startImport = async (options: ImportOptions) => {
    if (!pendingData) return;
    setShowImportModal(false);
    setLoading(true);
    setImportStatus('Importing...');
    try {
      await databaseService.importGoogleHistory(pendingData, options);
      setImportStatus('Import complete!');
      setPendingData(null);
      onImportComplete();
    } catch (err) {
      setImportStatus('Error importing.');
    } finally {
      setLoading(false);
    }
  };

  const cancelImport = () => {
    setShowImportModal(false);
    setLoading(false);
    setImportStatus('');
    setPendingData(null);
  };

  const onButtonClick = () => fileInputRef.current?.click();

  return {
    loading,
    setLoading,
    importStatus,
    setImportStatus,
    showImportModal,
    setShowImportModal,
    fileInputRef,
    handleFileSelect,
    startImport,
    cancelImport,
    onButtonClick
  };
}
