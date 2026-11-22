/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, Share2, Download, Camera, Upload, Edit3, CheckCircle2, 
  Settings, History, FileText, RefreshCw, Bluetooth, BluetoothConnected, 
  Smartphone, ShieldCheck, Car, Calendar, DollarSign, User, Hash, 
  MapPin, Check, AlertCircle, Info, Trash2, ArrowRight, Sparkles, HelpCircle
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import html2canvas from 'html2canvas';
import confetti from 'canvas-confetti';

interface TransactionData {
  id: string;
  tanggal: string;
  noRef: string;
  status: string;
  noBukti: string;
  atasNama: string;
  noPolisi: string;
  tanggalMasaLaku: string;
  noMesin: string;
  totalBayar: number;
  biayaAdmin: number;
  cetakEtbpkp: number;
  jumlahHarusDibayar: number;
  namaAgen: string;
  createdAt: string;
}

const DEFAULT_SETTINGS = {
  namaAgen: 'Loket PPOB Athar digital',
  biayaAdmin: 10000,
  cetakEtbpkp: 20000,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'scan' | 'preview' | 'history' | 'settings'>('scan');
  const [loadingOcr, setLoadingOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [rawOcrText, setRawOcrText] = useState('');
  const [showRawOcr, setShowRawOcr] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('esamsat_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  // Printer state
  const [printerDevice, setPrinterDevice] = useState<any>(null);
  const [printerName, setPrinterName] = useState<string>(() => localStorage.getItem('esamsat_printer_name') || '');
  const [isPrinting, setIsPrinting] = useState(false);

  // Transaction form state
  const [formData, setFormData] = useState<TransactionData>({
    id: '',
    tanggal: '2026-11-21T17:01',
    noRef: 'IVR/20261121/XXVI/XI/3264397733',
    status: 'Transaksi berhasil',
    noBukti: '7517952553636221',
    atasNama: 'NURIL AGUSTINA',
    noPolisi: 'S4782JAI',
    tanggalMasaLaku: '26-11-2027',
    noMesin: 'KF41E1829094',
    totalBayar: 326000,
    biayaAdmin: settings.biayaAdmin,
    cetakEtbpkp: settings.cetakEtbpkp,
    jumlahHarusDibayar: 326000 + settings.biayaAdmin + settings.cetakEtbpkp,
    namaAgen: settings.namaAgen,
    createdAt: new Date().toISOString(),
  });

  // History state
  const [history, setHistory] = useState<TransactionData[]>(() => {
    const saved = localStorage.getItem('esamsat_history');
    return saved ? JSON.parse(saved) : [];
  });

  // PWA Install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Receipt ref for html2canvas
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check for shared image from Service Worker
    async function checkSharedImage() {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('share') === 'true') {
        try {
          const cache = await caches.open('esamsat-jatim-v1');
          const res = await cache.match('/shared-image');
          if (res) {
            const blob = await res.blob();
            const imageUrl = URL.createObjectURL(blob);
            setUploadedImage(imageUrl);
            processImage(imageUrl);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (e) {
          console.error('Failed to load shared image:', e);
        }
      }
    }
    checkSharedImage();

    // PWA beforeinstallprompt listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Save history & settings
  useEffect(() => {
    localStorage.setItem('esamsat_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('esamsat_settings', JSON.stringify(settings));
  }, [settings]);

  // Recalculate total when totalBayar or fees change
  useEffect(() => {
    const tBayar = Number(formData.totalBayar) || 0;
    const admin = Number(formData.biayaAdmin) || settings.biayaAdmin;
    const etbpkp = Number(formData.cetakEtbpkp) || settings.cetakEtbpkp;
    const grandTotal = tBayar + admin + etbpkp;
    setFormData(prev => ({
      ...prev,
      totalBayar: tBayar,
      biayaAdmin: admin,
      cetakEtbpkp: etbpkp,
      jumlahHarusDibayar: grandTotal,
      namaAgen: settings.namaAgen
    }));
  }, [formData.totalBayar, formData.biayaAdmin, formData.cetakEtbpkp, settings]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert('Aplikasi sudah terinstal atau browser tidak mendukung instalasi otomatis. Gunakan menu titik tiga di browser Chrome -> "Tambahkan ke Layar Utama" / "Install app".');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  // OCR Processing
  const processImage = async (imageSource: string) => {
    setLoadingOcr(true);
    setOcrProgress(0);
    setOcrStatusText('Memuat mesin OCR (Tesseract.js)...');

    try {
      const worker = await Tesseract.createWorker('ind+eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
            setOcrStatusText(`Memindai teks bukti bayar: ${Math.round(m.progress * 100)}%`);
          } else {
            setOcrStatusText(m.status);
          }
        }
      });

      const ret = await worker.recognize(imageSource);
      await worker.terminate();

      const text = ret.data.text;
      setRawOcrText(text);
      parseOcrText(text);
      setLoadingOcr(false);
      setActiveTab('preview');
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    } catch (error) {
      console.error('OCR Error:', error);
      setLoadingOcr(false);
      alert('Gagal memindai OCR otomatis. Silakan isi data secara manual atau gunakan data contoh.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setUploadedImage(imageUrl);
      processImage(imageUrl);
    }
  };

  // Parse extracted OCR text using smart regex heuristics
  const parseOstr = (text: string, regex: RegExp, defaultVal: string) => {
    const match = text.match(regex);
    return match && match[1] ? match[1].trim() : defaultVal;
  };

  const parseOcrText = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    let extractedAtasNama = '';
    let extractedNoPolisi = '';
    let extractedNoRef = '';
    let extractedBuktiBayar = '';
    let extractedNoMesin = '';
    let extractedMasaLaku = '';
    let extractedTotalBayar = 0;

    for (const line of lines) {
      const upperLine = line.toUpperCase();
      let parts = upperLine.split(/[:|]/).map(p => p.trim());
      if (parts.length < 2) {
        parts = upperLine.split(/\s{2,}/).map(p => p.trim());
      }
      
      const leftKey = parts[0] || '';
      const rightVal = parts[1] || '';

      if (leftKey.includes('NAMA') || leftKey.includes('PEMILIK') || leftKey.includes('ATAS NAMA')) {
        if (rightVal) extractedAtasNama = rightVal;
        else {
          const clean = upperLine.replace(/NAMA|PEMILIK|ATAS/g, '').trim();
          if (clean) extractedAtasNama = clean;
        }
      } else if (leftKey.includes('POLISI') || leftKey.includes('PLAT') || leftKey.includes('NOPOL')) {
        const match = upperLine.match(/\b([A-Z]{1,2}\s*\d{1,4}\s*[A-Z]{1,3})\b/);
        if (match) extractedNoPolisi = match[1];
        else if (rightVal) extractedNoPolisi = rightVal;
      } else if (leftKey.includes('REF') || leftKey.includes('KODE')) {
        const match = rightVal.match(/[\d\w]{5,20}/);
        if (match) extractedNoRef = match[0];
      } else if (leftKey.includes('BUKTI') || leftKey.includes('BAYAR') || leftKey.includes('STRUK')) {
        if (rightVal) extractedBuktiBayar = rightVal.replace(/[^\d]/g, '');
        else {
          const match = upperLine.match(/[\d]{6,16}/);
          if (match) extractedBuktiBayar = match[0];
        }
      } else if (leftKey.includes('MESIN') || leftKey.includes('RANGKA')) {
        if (rightVal) {
          extractedNoMesin = rightVal.replace(/^(NOMOR|NO\.?)\s*/i, '');
        } else {
          const clean = upperLine.replace(/MESIN|RANGKA|NOMOR|NO\.?/g, '').replace(/[:|]/g, '').trim();
          if (clean) extractedNoMesin = clean;
        }
      } else if (leftKey.includes('MASA LAKU') || leftKey.includes('BERLAKU') || leftKey.includes('JATUH TEMPO')) {
        if (rightVal) {
          extractedMasaLaku = rightVal.replace(/\//g, '-');
        } else {
          const match = upperLine.match(/\d{2}[-/]\d{2}[-/]\d{4}/);
          if (match) extractedMasaLaku = match[0].replace(/\//g, '-');
        }
      } else if (leftKey.includes('TAGIHAN') || leftKey.includes('PKB')) {
        // Skip intermediate items for total bayar
      }
    }

    // Explicit pass for Total Bayar line to ensure nominal on the right of Total Bayar is captured
    for (const line of lines) {
      const up = line.toUpperCase();
      if (up.includes('TOTAL BAYAR') || (up.includes('TOTAL') && up.includes('BAYAR'))) {
        const match = line.match(/(?:Rp\.?|\b)\s*([\d]{1,3}(?:[.,]\d{3})+|\d{4,9})/);
        if (match) {
          const val = parseInt(match[1].replace(/[^\d]/g, ''), 10);
          if (val > 5000) {
            extractedTotalBayar = val;
            break;
          }
        }
      }
    }

    const upperText = text.toUpperCase();
    const platMatch = upperText.match(/\b([A-Z]{1,2}\s*\d{1,4}\s*[A-Z]{1,3})\b/);
    const finalNoPolisi = extractedNoPolisi || (platMatch ? platMatch[1] : formData.noPolisi);
    const finalAtasNama = extractedAtasNama || formData.atasNama;
    const finalNoRef = extractedNoRef || 'REF-' + Math.floor(100000 + Math.random() * 900000);
    const finalBuktiBayar = extractedBuktiBayar || formData.noBukti;
    const finalNoMesin = extractedNoMesin || formData.noMesin;
    const finalMasaLaku = extractedMasaLaku || formData.tanggalMasaLaku;

    const numbers = upperText.match(/(?:Rp\.?|\b)\s*([\d]{1,3}(?:[.,]\d{3})+|\d{4,9})/g);
    let totalByr = extractedTotalBayar || 2500000;
    if (!extractedTotalBayar && numbers && numbers.length > 0) {
      const cleanNums = numbers.map(n => parseInt(n.replace(/[^\d]/g, ''), 10)).filter(n => n > 50000);
      if (cleanNums.length > 0) totalByr = cleanNums[cleanNums.length - 1];
    }

    setFormData(prev => ({
      ...prev,
      noPolisi: finalNoPolisi,
      noRef: finalNoRef,
      noBukti: finalBuktiBayar,
      atasNama: finalAtasNama,
      noMesin: finalNoMesin,
      totalBayar: totalByr,
      tanggalMasaLaku: finalMasaLaku.replace(/\//g, '-'),
      tanggal: new Date().toISOString().slice(0, 16)
    }));
  };

  const loadSampleData = () => {
    setFormData({
      id: '',
      tanggal: '2026-11-21T17:01',
      noRef: 'IVR/20261121/XXVI/XI/3264397733',
      status: 'Transaksi berhasil',
      noBukti: '7517952553636221',
      atasNama: 'NURIL AGUSTINA',
      noPolisi: 'S4782JAI',
      tanggalMasaLaku: '26-11-2027',
      noMesin: 'KF41E1829094',
      totalBayar: 326000,
      biayaAdmin: settings.biayaAdmin,
      cetakEtbpkp: settings.cetakEtbpkp,
      jumlahHarusDibayar: 326000 + settings.biayaAdmin + settings.cetakEtbpkp,
      namaAgen: settings.namaAgen,
      createdAt: new Date().toISOString(),
    });
    setUploadedImage('/assets/aistudio/IMG-20261121-WA0013_40d74996.jpg');
    setActiveTab('preview');
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } });
  };

  // Web Bluetooth Thermal Printer Integration
  const connectBluetoothPrinter = async () => {
    try {
      const nav = navigator as any;
      if (!nav.bluetooth) {
        alert('Web Bluetooth API tidak didukung di browser ini. Gunakan Google Chrome di Android atau Laptop.');
        return;
      }

      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb']
      });

      setPrinterDevice(device);
      setPrinterName(device.name || 'Printer Thermal Bluetooth');
      localStorage.setItem('esamsat_printer_name', device.name || 'Printer Thermal Bluetooth');
      alert(`Berhasil terhubung ke printer: ${device.name || 'Thermal Printer'}`);
    } catch (error) {
      console.error('Bluetooth connection error:', error);
      alert('Gagal menghubungkan printer Bluetooth atau dibatalkan oleh pengguna.');
    }
  };

  const disconnectPrinter = () => {
    setPrinterDevice(null);
    setPrinterName('');
    localStorage.removeItem('esamsat_printer_name');
    alert('Printer diputus.');
  };

  // Generate ESC/POS Byte Commands for 58mm / 80mm Thermal Printer
  const printThermalReceipt = async () => {
    setIsPrinting(true);
    try {
      if (!printerDevice || !printerDevice.gatt) {
        setIsPrinting(false);
        alert('Printer Bluetooth belum terhubung! Silakan pilih dan hubungkan printer thermal Bluetooth terlebih dahulu melalui tombol "Cari & Hubungkan" di menu Pengaturan (ikon gear).');
        setActiveTab('settings');
        return;
      }

      const server = await printerDevice.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb').catch(() => null) 
        || await server.getPrimaryService('0000ff00-0000-1000-8000-00805f9b34fb').catch(() => null);

      if (!service) {
        throw new Error('Printer service ESC/POS tidak ditemukan pada perangkat.');
      }

      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb').catch(() => null)
        || await service.getCharacteristic('0000ff02-0000-1000-8000-00805f9b34fb').catch(() => null)
        || (await service.characteristics())[0];

      if (!characteristic) {
        throw new Error('Karakteristik write printer tidak ditemukan.');
      }

      const encoder = new TextEncoder();
      const ESC = '\x1B';
      const GS = '\x1D';
      
      let commands = '';
      commands += ESC + '@'; // Initialize
      commands += ESC + '\x61\x01'; // Center alignment
      commands += ESC + '\x45\x01'; // Bold ON
      commands += 'E-SAMSAT JAWA TIMUR\n';
      commands += 'BUKTI PEMBAYARAN PAJAK KENDARAAN\n';
      commands += ESC + '\x45\x00'; // Bold OFF
      commands += '--------------------------------\n';
      commands += ESC + '\x61\x00'; // Left alignment
      commands += `Tanggal      : ${formData.tanggal.replace('T', ' ')}\n`;
      commands += `No. Ref      : ${formData.noRef}\n`;
      commands += `Bukti Bayar  : ${formData.noBukti}\n`;
      commands += `Status       : ${formData.status}\n`;
      commands += '--------------------------------\n';
      commands += `Atas Nama    : ${formData.atasNama}\n`;
      commands += `No. Polisi   : ${formData.noPolisi}\n`;
      commands += `Masa Laku    : ${formData.tanggalMasaLaku}\n`;
      commands += `No. Mesin    : ${formData.noMesin}\n`;
      commands += '--------------------------------\n';
      commands += `Total Bayar  : Rp ${formData.totalBayar.toLocaleString('id-ID')}\n`;
      commands += `Admin Loket  : Rp ${formData.biayaAdmin.toLocaleString('id-ID')}\n`;
      commands += `Cetak eTBPKP : Rp ${formData.cetakEtbpkp.toLocaleString('id-ID')}\n`;
      commands += '--------------------------------\n';
      commands += ESC + '\x45\x01'; // Bold ON
      commands += `JUMLAH DIBAYAR: Rp ${formData.jumlahHarusDibayar.toLocaleString('id-ID')}\n`;
      commands += ESC + '\x45\x00'; // Bold OFF
      commands += '--------------------------------\n';
      commands += ESC + '\x61\x01'; // Center alignment
      commands += `Agen: ${formData.namaAgen}\n`;
      commands += 'Terima Kasih Atas Pembayaran Anda\n';
      commands += 'Simpan Struk Ini Sebagai Bukti Sah\n\n\n';
      commands += GS + '\x56\x42\x00'; // Cut paper

      const dataBytes = encoder.encode(commands);
      await characteristic.writeValue(dataBytes);

      setIsPrinting(false);
      alert('Struk berhasil dicetak melalui Printer Thermal Bluetooth!');
      saveTransactionToHistory();
    } catch (error) {
      console.error('Print error:', error);
      setIsPrinting(false);
      alert('Gagal mencetak ke printer Bluetooth. Pastikan printer dalam keadaan menyala dan terhubung.');
    }
  };

  const saveTransactionToHistory = () => {
    const newTx: TransactionData = {
      ...formData,
      id: 'TX-' + Date.now(),
      createdAt: new Date().toISOString()
    };
    setHistory(prev => [newTx, ...prev]);
    confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
  };

  // Export Receipt as PNG Image with robust fallback
  const downloadReceiptImage = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });
      const image = canvas.toDataURL('image/png');
      
      const a = document.createElement('a');
      a.href = image;
      a.download = `Struk-eSamsat-${formData.noPolisi.replace(/\s+/g, '-')}-${formData.noRef || 'bayar'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Also open print/view window as reliable fallback for mobile
      const win = window.open();
      if (win) {
        win.document.write(`<html><head><title>Struk e-Samsat Jatim</title></head><body style="text-align:center;padding:20px;font-family:sans-serif;"><p style="font-weight:bold;margin-bottom:10px;">Struk Berhasil Digenerate. Tekan tombol simpan / print di bawah:</p><img src="${image}" style="max-width:320px;border:1px solid #ccc;box-shadow:0 2px 8px rgba(0,0,0,0.2);" /><br/><br/><button onclick="window.print()" style="padding:10px 20px;background:#059669;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Cetak / Simpan PDF</button></body></html>`);
        win.document.close();
      }

      confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    } catch (e) {
      console.error('Export PNG error:', e);
      window.print();
    }
  };

  // Share Receipt via Web Share API
  const shareReceiptImage = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `Struk-eSamsat-${formData.noPolisi.replace(/\s+/g, '-')}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'Struk e-Samsat Jatim',
              text: `Bukti Pembayaran e-Samsat Jatim No. Pol ${formData.noPolisi} - Total Rp ${formData.jumlahHarusDibayar.toLocaleString('id-ID')} (${formData.status})`,
              files: [file],
            });
          } catch (err) {
            if ((err as Error).name !== 'AbortError') {
              console.error('Share error:', err);
            }
          }
        } else {
          // Fallback download if share API not supported
          downloadReceiptImage();
        }
      }, 'image/png');
    } catch (e) {
      console.error('Share blob error:', e);
      downloadReceiptImage();
    }
  };

  const handleInputChange = (field: keyof TransactionData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans pb-20">
      {/* Top Header */}
      <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-40 border-b border-emerald-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-inner border border-emerald-500">
              <Car className="w-6 h-6 text-emerald-100" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight flex items-center gap-2">
                e-Samsat Jatim <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-700 text-emerald-200 border border-emerald-600">Kasir PPOB</span>
              </h1>
              <p className="text-xs text-emerald-200 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                {settings.namaAgen}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isInstallable && (
              <button 
                onClick={handleInstallClick}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow flex items-center gap-1.5 transition border border-emerald-500 active:scale-95"
              >
                <Smartphone className="w-4 h-4" />
                <span>Install PWA</span>
              </button>
            )}

            <button 
              onClick={() => setActiveTab('settings')}
              className="p-2 rounded-lg bg-emerald-700/60 hover:bg-emerald-700 text-emerald-100 transition relative"
              title="Pengaturan & Printer"
            >
              <Settings className="w-5 h-5" />
              {printerName && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-emerald-800"></span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 pb-24">
        {/* TAB 1: SCAN & INPUT */}
        {activeTab === 'scan' && (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                    <Camera className="w-5 h-5 text-emerald-400" />
                    Scan Bukti Transfer / Mutasi OCR
                  </h2>
                  <p className="text-xs text-slate-400">
                    Unggah screenshot bukti pembayaran m-Banking/ATM. OCR otomatis ekstrak data kendaraan & pajak.
                  </p>
                </div>
                <button
                  onClick={loadSampleData}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-500/30 transition flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Data Contoh</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-xl p-6 text-center transition bg-slate-900/50 group relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileUpload} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-900/50 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition border border-emerald-700/50">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Ketuk untuk Unggah / Ambil Foto</p>
                    <p className="text-xs text-slate-400 mt-1">Mendukung PNG, JPG, WEBP (Juga mendukung Share Target dari Android)</p>
                  </div>
                </div>
              </div>

              {uploadedImage && (
                <div className="mt-4 p-3 bg-slate-900 rounded-xl border border-slate-700 flex items-center gap-4">
                  <img src={uploadedImage} alt="Bukti Transfer" className="w-20 h-20 object-cover rounded-lg border border-slate-600" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-emerald-400">Gambar berhasil dimuat</p>
                    <p className="text-xs text-slate-400">OCR lokal siap diproses atau sudah diekstrak</p>
                  </div>
                  <button 
                    onClick={() => processImage(uploadedImage)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-medium transition"
                  >
                    Scan Ulang
                  </button>
                </div>
              )}

              {loadingOcr && (
                <div className="mt-4 p-4 bg-emerald-950/60 rounded-xl border border-emerald-800 text-center space-y-3 animate-pulse">
                  <div className="flex items-center justify-center gap-2 text-emerald-300 font-medium text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>{ocrStatusText}</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${ocrProgress}%` }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions / Manual Navigation */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setActiveTab('preview')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-xl shadow-lg font-medium flex items-center justify-between group transition active:scale-95"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-700 rounded-lg">
                    <Edit3 className="w-5 h-5 text-emerald-200" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">Formulir Preview</p>
                    <p className="text-xs text-emerald-200">Tap-to-Edit Data</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-emerald-200 group-hover:translate-x-1 transition" />
              </button>

              <button
                onClick={() => {
                  setActiveTab('preview');
                }}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 p-4 rounded-xl shadow-lg font-medium flex items-center justify-between group transition active:scale-95"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg">
                    <Printer className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">Cetak & Struk</p>
                    <p className="text-xs text-slate-400">Thermal / PNG</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition" />
              </button>
            </div>

            {/* Info PWA & Share Target Guide */}
            <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700 text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-400">
                <Info className="w-4 h-4" />
                <span>Fitur PWA & Share Target Android</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Aplikasi ini mendukung fitur <strong className="text-slate-200">Android Share Target</strong>. Saat Anda membuka galeri foto di HP Android dan memilih <strong className="text-slate-200">Bagikan (Share)</strong> ke aplikasi <strong className="text-slate-200">e-samsat Jatim kasir</strong>, gambar bukti transfer akan otomatis diterima dan dipindai OCR lokal tanpa internet!
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: FORM PREVIEW & INTERACTIVE EDIT */}
        {activeTab === 'preview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <Edit3 className="w-5 h-5" />
                  Preview & Tap-to-Edit Transaksi
                </h2>
                <p className="text-xs text-slate-400">Sentuh field di bawah untuk mengedit hasil OCR atau input manual.</p>
              </div>
              <button
                onClick={() => setActiveTab('scan')}
                className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 transition"
              >
                ← Kembali ke Scan
              </button>
            </div>

            {/* Form Inputs Grid */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-300 pb-2 border-b border-slate-700 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Informasi Transaksi & e-TBPKP</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tanggal & Waktu</label>
                  <input
                    type="datetime-local"
                    value={formData.tanggal}
                    onChange={e => handleInputChange('tanggal', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nomor Referensi (No Ref)</label>
                  <input
                    type="text"
                    value={formData.noRef}
                    onChange={e => handleInputChange('noRef', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Status Transaksi</label>
                  <input
                    type="text"
                    value={formData.status}
                    onChange={e => handleInputChange('status', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Bukti Bayar</label>
                  <input
                    type="text"
                    value={formData.noBukti}
                    onChange={e => handleInputChange('noBukti', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Atas Nama (Pemilik)</label>
                  <input
                    type="text"
                    value={formData.atasNama}
                    onChange={e => handleInputChange('atasNama', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nomor Polisi (Plat No)</label>
                  <input
                    type="text"
                    value={formData.noPolisi}
                    onChange={e => handleInputChange('noPolisi', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-emerald-400 uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>





                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tanggal Masa Laku (DueDate)</label>
                  <input
                    type="text"
                    value={formData.tanggalMasaLaku}
                    onChange={e => handleInputChange('tanggalMasaLaku', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nomor Mesin</label>
                  <input
                    type="text"
                    value={formData.noMesin}
                    onChange={e => handleInputChange('noMesin', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Total Bayar (Rp)</label>
                  <input
                    type="number"
                    value={formData.totalBayar}
                    onChange={e => handleInputChange('totalBayar', Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Cetak e-TBPKP (Rp)</label>
                  <input
                    type="number"
                    value={formData.cetakEtbpkp}
                    onChange={e => handleInputChange('cetakEtbpkp', Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Biaya admin loket (Rp)</label>
                  <input
                    type="number"
                    value={formData.biayaAdmin}
                    onChange={e => handleInputChange('biayaAdmin', Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Total Calculation Display */}
              <div className="mt-4 p-4 bg-emerald-950/40 rounded-xl border border-emerald-800/60 flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-300 font-medium">Jumlah yg harus dibayar</p>
                  <p className="text-xl font-extrabold text-emerald-400">
                    Rp {formData.jumlahHarusDibayar.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Nama Agen Kasir</p>
                  <p className="text-xs font-bold text-slate-200">{formData.namaAgen}</p>
                </div>
              </div>
            </div>

            {/* Live Thermal Receipt Preview Card */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Struk Digital (Thermal Preview)</span>
                </h3>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-900 text-emerald-300 border border-emerald-700">58mm / 80mm</span>
              </div>

              {/* Printable Receipt DOM element */}
              <div className="flex justify-center overflow-x-auto py-2">
                <div 
                  ref={receiptRef} 
                  className="bg-white text-black font-bold p-6 rounded-none shadow-2xl w-[350px] font-mono text-xs leading-tight border border-slate-300 select-none"
                  style={{ fontFamily: '"Courier New", Courier, monospace' }}
                >
                  <div className="pb-3 border-b border-dashed border-black space-y-1 text-center">
                    <p className="font-extrabold text-sm tracking-wider text-black">E-SAMSAT JAWA TIMUR</p>
                    <p className="text-[11px] font-extrabold text-black">BUKTI PEMBAYARAN PAJAK KENDARAAN</p>
                    <p className="text-[10px] font-bold text-black">Layanan Samsat Keliling / PPOB Resmi</p>
                  </div>

                  <div className="py-2 border-b border-dashed border-black space-y-1 text-[11px] font-bold text-black">
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">Tanggal</span>
                      <span className="text-center">:</span>
                      <span className="text-left">{formData.tanggal.replace('T', ' ')}</span>
                    </div>
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">No. Ref</span>
                      <span className="text-center">:</span>
                      <span className="text-left">{formData.noRef}</span>
                    </div>
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">Bukti Bayar</span>
                      <span className="text-center">:</span>
                      <span className="text-left">{formData.noBukti}</span>
                    </div>
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">Status</span>
                      <span className="text-center">:</span>
                      <span className="text-left">{formData.status}</span>
                    </div>
                  </div>

                  <div className="py-2 border-b border-dashed border-black space-y-1 text-[11px] font-bold text-black">
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">Atas Nama</span>
                      <span className="text-center">:</span>
                      <span className="text-left">{formData.atasNama}</span>
                    </div>
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">No. Polisi</span>
                      <span className="text-center">:</span>
                      <span className="text-left">{formData.noPolisi}</span>
                    </div>
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">Masa Laku</span>
                      <span className="text-center">:</span>
                      <span className="text-left">{formData.tanggalMasaLaku}</span>
                    </div>
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">No. Mesin</span>
                      <span className="text-center">:</span>
                      <span className="text-left">{formData.noMesin}</span>
                    </div>
                  </div>

                  <div className="py-2 border-b border-dashed border-black space-y-1 text-[11px] font-bold text-black">
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">Total Bayar</span>
                      <span className="text-center">:</span>
                      <span className="text-left">Rp {formData.totalBayar.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">Biaya admin loket</span>
                      <span className="text-center">:</span>
                      <span className="text-left">Rp {formData.biayaAdmin.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">Cetak e-TBPKP</span>
                      <span className="text-center">:</span>
                      <span className="text-left">Rp {formData.cetakEtbpkp.toLocaleString('id-ID')}</span>
                    </div>
                  </div>

                  <div className="py-2 border-b border-dashed border-black text-xs font-extrabold text-black">
                    <div className="grid grid-cols-[130px_14px_1fr]">
                      <span className="text-left">JUMLAH DIBAYAR</span>
                      <span className="text-center">:</span>
                      <span className="text-left text-sm">Rp {formData.jumlahHarusDibayar.toLocaleString('id-ID')}</span>
                    </div>
                  </div>

                  <div className="pt-3 space-y-1 text-[10px] font-bold text-center text-black">
                    <p className="font-extrabold text-black">Agen: {formData.namaAgen}</p>
                    <p className="font-bold text-black">Terima Kasih Atas Pembayaran Anda</p>
                    <p className="font-bold text-black">Simpan Struk Ini Sebagai Bukti Sah</p>
                    <p className="text-[9px] font-bold text-black mt-2">=== e-Samsat Jatim Kasir PWA ===</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons for Printing & Export */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => {
                    window.print();
                    saveTransactionToHistory();
                  }}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                >
                  <Printer className="w-5 h-5 text-emerald-200" />
                  <span>Cetak Printer Tinta / Standar (USB/WiFi)</span>
                </button>

                <button
                  onClick={printThermalReceipt}
                  disabled={isPrinting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition active:scale-95 disabled:opacity-50"
                >
                  <Bluetooth className="w-5 h-5" />
                  <span>{isPrinting ? 'Mencetak...' : (printerName ? `Thermal BT (${printerName})` : 'Cetak Thermal Bluetooth')}</span>
                </button>

                <button
                  onClick={downloadReceiptImage}
                  className="bg-slate-700 hover:bg-slate-600 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                >
                  <Download className="w-5 h-5 text-emerald-400" />
                  <span>Simpan Gambar PNG</span>
                </button>

                <button
                  onClick={shareReceiptImage}
                  className="bg-sky-600 hover:bg-sky-500 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                >
                  <Share2 className="w-5 h-5" />
                  <span>Bagikan Struk (WA/Medsos)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RIWAYAT TRANSAKSI */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Riwayat Transaksi Tersimpan
                </h2>
                <p className="text-xs text-slate-400">Daftar transaksi kasir yang telah berhasil diproses.</p>
              </div>
              {history.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Hapus seluruh riwayat transaksi?')) setHistory([]);
                  }}
                  className="text-xs bg-red-900/40 hover:bg-red-900/60 text-red-300 px-3 py-1.5 rounded-lg border border-red-800 flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Riwayat</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="bg-slate-800 rounded-2xl p-10 text-center border border-slate-700 space-y-3">
                <div className="w-12 h-12 bg-slate-700 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-300">Belum ada riwayat transaksi</p>
                <p className="text-xs text-slate-400">Transaksi yang dicetak atau disimpan akan otomatis muncul di sini.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((tx) => (
                  <div key={tx.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 bg-emerald-900 text-emerald-300 rounded border border-emerald-700">
                          {tx.noPolisi}
                        </span>
                        <span className="text-xs text-slate-400">{tx.noRef}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-100">{tx.atasNama}</p>
                      <p className="text-xs text-slate-400">Waktu: {tx.tanggal.replace('T', ' ')} • Agen: {tx.namaAgen}</p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-700">
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-slate-400">Total Pembayaran</p>
                        <p className="text-sm font-extrabold text-emerald-400">Rp {tx.jumlahHarusDibayar.toLocaleString('id-ID')}</p>
                      </div>
                      <button
                        onClick={() => {
                          setFormData(tx);
                          setActiveTab('preview');
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Buka / Cetak</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PENGATURAN & PRINTER BLUETOOTH */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Pengaturan Agen & Printer Thermal
              </h2>
              <p className="text-xs text-slate-400">Konfigurasi nama agen PPOB, biaya admin, dan koneksi printer Bluetooth 58mm/80mm.</p>
            </div>

            {/* Printer Bluetooth Settings */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Bluetooth className="w-4 h-4 text-emerald-400" />
                <span>Koneksi Printer Bluetooth Thermal</span>
              </h3>

              <div className="p-4 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Status Printer Terhubung:</p>
                  <p className="text-sm font-bold text-emerald-400 flex items-center gap-1.5 mt-1">
                    {printerName ? (
                      <>
                        <BluetoothConnected className="w-4 h-4 text-emerald-400 animate-pulse" />
                        <span>{printerName}</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                        <span className="text-slate-400 font-normal">Belum terhubung (Default Print Browser)</span>
                      </>
                    )}
                  </p>
                </div>

                {printerName ? (
                  <button
                    onClick={disconnectPrinter}
                    className="bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs px-3 py-2 rounded-lg border border-red-800 transition"
                  >
                    Putus
                  </button>
                ) : (
                  <button
                    onClick={connectBluetoothPrinter}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow transition flex items-center gap-1.5"
                  >
                    <Bluetooth className="w-4 h-4" />
                    <span>Cari & Hubungkan</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400">
                *Alamat printer disimpan otomatis di browser (`localStorage`) agar tidak perlu pairing ulang setiap kali mencetak struk.
              </p>
            </div>

            {/* Agent & Default Fees Form */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                <span>Identitas Agen & Biaya Default</span>
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nama Agen PPOB</label>
                  <input
                    type="text"
                    value={settings.namaAgen}
                    onChange={e => setSettings((prev: typeof settings) => ({ ...prev, namaAgen: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Default Biaya Admin (Rp)</label>
                    <input
                      type="number"
                      value={settings.biayaAdmin}
                      onChange={e => setSettings((prev: typeof settings) => ({ ...prev, biayaAdmin: Number(e.target.value) }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Default Cetak e-TBPKP (Rp)</label>
                    <input
                      type="number"
                      value={settings.cetakEtbpkp}
                      onChange={e => setSettings((prev: typeof settings) => ({ ...prev, cetakEtbpkp: Number(e.target.value) }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  onClick={() => alert('Pengaturan berhasil disimpan!')}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-lg"
                >
                  Simpan Pengaturan
                </button>
              </div>
            </div>

            {/* PWA Install Instructions Card */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3">
              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                <span>Cara Instal di Android (PWA)</span>
              </h3>
              <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1.5 leading-relaxed">
                <li>Buka aplikasi ini di browser <strong className="text-slate-100">Google Chrome Android</strong>.</li>
                <li>Ketuk menu titik tiga (<strong className="text-slate-100">⋮</strong>) di pojok kanan atas browser.</li>
                <li>Pilih opsi <strong className="text-emerald-400">"Tambahkan ke Layar Utama"</strong> atau <strong className="text-emerald-400">"Install App"</strong>.</li>
                <li>Aplikasi akan terpasang di HP Android Anda layaknya aplikasi native dengan dukungan Share Target gambar struk!</li>
              </ol>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar (Mobile-First Bottom Sheet Style) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 py-2 px-4 z-40">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition ${activeTab === 'scan' ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Camera className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-medium">Scan OCR</span>
          </button>

          <button
            onClick={() => setActiveTab('preview')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition ${activeTab === 'preview' ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <FileText className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-medium">Preview Struk</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition ${activeTab === 'history' ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <History className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-medium">Riwayat</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition ${activeTab === 'settings' ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Settings className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-medium">Printer & Agen</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
