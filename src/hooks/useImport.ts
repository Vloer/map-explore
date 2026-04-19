import { useState, useRef } from 'react';
import { databaseService } from '../services/DatabaseService';
import type { ImportOptions, TimelineData } from '../types';

/**
 * Hook to manage the location history import process.
 * Handles file selection, parsing, and transactional database import.
 * 
 * @param {() => void} onImportComplete Callback executed after a successful import.
 * @returns {object} Import state and control functions.
 */
export function useImport(onImportComplete: () => void) {
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [pendingData, setPendingData] = useState<TimelineData | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handles the selection of a JSON file and parses its contents.
   * @param {React.ChangeEvent<HTMLInputElement>} event The file input change event.
   */
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

  /**
   * Starts the database import process with the provided options.
   * @param {ImportOptions} options Configuration for the import.
   */
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

  /**
   * Cancels the current import process and resets state.
   */
  const cancelImport = () => {
    setShowImportModal(false);
    setLoading(false);
    setImportStatus('');
    setPendingData(null);
  };

  /**
   * Triggers the hidden file input click event.
   */
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

