import { useState, useRef } from 'react';
import { importService } from '../services/ImportService';
import type { TimelineData } from '../types';

/**
 * Hook to manage the location history import process.
 * Handles file selection, parsing, and transactional database import.
 * Supports both Google Timeline (JSON) and GPX formats.
 * 
 * @param {() => void} onImportComplete Callback executed after a successful import.
 * @returns {object} Import state and control functions.
 */
export function useImport(onImportComplete: () => void) {
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handles the selection of a file and parses its contents.
   * @param {React.ChangeEvent<HTMLInputElement>} event The file input change event.
   */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    const fileName = file.name.toLowerCase();
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        
        if (fileName.endsWith('.json')) {
          const data = JSON.parse(text);
          setImportStatus('Importing JSON...');
          await importService.importGoogleHistory(data as TimelineData);
        } else if (fileName.endsWith('.gpx')) {
          setImportStatus('Importing GPX...');
          await importService.importGpx(text);
        } else {
          throw new Error("Unsupported file format");
        }
        
        setImportStatus('Import complete!');
        onImportComplete();
      } catch (err) {
        console.error("useImport: File parsing or import failed", err);
        setImportStatus('Error importing file.');
      } finally {
        setLoading(false);
      }
    };
    
    reader.readAsText(file);
    event.target.value = '';
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
    fileInputRef,
    handleFileSelect,
    onButtonClick
  };
}
