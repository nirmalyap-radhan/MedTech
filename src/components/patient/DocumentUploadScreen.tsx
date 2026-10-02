import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { OCRDocument, StructuredMedicine, OCRPatientDetails } from '../../types';
import {
  Upload,
  Camera,
  FileText,
  Edit2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  FileCheck,
  AlertCircle,
  X,
  Pill,
  Sparkles,
  Calendar,
  User,
  Activity,
  Plus,
  Trash2,
  Stethoscope,
  HeartPulse,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ocrService } from '../../services/ocrService';
import { parsePrescriptionText, cleanOCRNoise } from '../../utils/prescriptionParser';

interface DocumentUploadScreenProps {
  onNext: () => void;
  onBack: () => void;
}

interface CameraModalProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch {
      setError('Camera access denied or unavailable. Please allow camera access and try again.');
    }
  }, []);

  React.useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const snap = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(file);
      }
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-lg overflow-hidden border border-[#D8E3DC]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EFEA]">
          <h3 className="font-['Plus_Jakarta_Sans','Manrope'] font-bold text-base text-[#142B25] flex items-center space-x-2">
            <Camera className="w-5 h-5 text-[#145A4D]" />
            <span>Kiosk High-Res Document Scanner</span>
          </h3>
          <button onClick={onClose} className="text-[#6B857C] hover:text-[#142B25] transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error ? (
          <div className="p-6 flex flex-col items-center space-y-3 text-center">
            <AlertCircle className="w-10 h-10 text-red-500" />
            <p className="text-sm text-[#5B736B]">{error}</p>
            <button onClick={onClose} className="px-5 py-2.5 bg-[#124E43] text-white text-sm font-semibold rounded-full cursor-pointer">
              Close
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="relative bg-black rounded-2xl overflow-hidden aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-white animate-spin" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-1">
              <button onClick={onClose} className="px-5 py-2.5 border border-[#D5E4DB] rounded-full text-xs font-bold text-[#5B736B] hover:bg-[#F2F5F3] cursor-pointer">
                Cancel
              </button>
              <button
                onClick={snap}
                disabled={!ready}
                className="px-7 py-2.5 bg-[#124E43] disabled:opacity-40 text-white font-bold text-xs rounded-full flex items-center space-x-2 shadow-sm hover:bg-[#0B352E] transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Capture Prescription</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const DocumentUploadScreen: React.FC<DocumentUploadScreenProps> = ({ onNext, onBack }) => {
  const { currentDraft, addDraftDocument, removeDraftDocument, updateDraftDocument, currentLanguage } = useApp();

  const [isScanning, setIsScanning] = useState(false);
  const [scanStepText, setScanStepText] = useState('Reading document...');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(
    currentDraft.documents[0]?.id || null
  );
  const [isEditingMeds, setIsEditingMeds] = useState(false);
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');
  const [newMedFreq, setNewMedFreq] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeDoc =
    currentDraft.documents.find((d) => d.id === selectedDocId) ||
    currentDraft.documents[currentDraft.documents.length - 1] ||
    null;

  // Derive rich, structured clinical data even if reading legacy or newly uploaded documents
  const parsedData = useMemo(() => {
    if (!activeDoc) return null;
    const isPrescription = activeDoc.type === 'Prescription';
    const raw = activeDoc.rawExtractedText || activeDoc.findings || '';
    const parsed = isPrescription ? parsePrescriptionText(raw) : { medicines: [], patient: {}, formattedMedicinesList: [], clinicalDescription: '', handwrittenText: '' };

    const structuredMeds: StructuredMedicine[] =
      activeDoc.structuredMedicines && activeDoc.structuredMedicines.length > 0
        ? activeDoc.structuredMedicines
        : (isPrescription ? parsed.medicines : []);

    const patientDetails: OCRPatientDetails = {
      ...parsed.patient,
      ...(activeDoc.patientDetails || {}),
    };

    const displayMeds: string[] =
      activeDoc.medicines && activeDoc.medicines.length > 0
        ? activeDoc.medicines
        : (isPrescription ? parsed.formattedMedicinesList : []);

    const cleanFindings =
      activeDoc.findings && activeDoc.findings !== 'No findings extracted'
        ? activeDoc.findings
        : (parsed.clinicalDescription && parsed.clinicalDescription !== 'Clinical consultation recorded'
            ? parsed.clinicalDescription
            : cleanOCRNoise(activeDoc.findings));

    const handwrittenText =
      activeDoc.handwrittenText ||
      parsed.handwrittenText ||
      (displayMeds.length > 0 ? displayMeds.join('\n') : cleanOCRNoise(activeDoc.findings));

    return {
      structuredMeds,
      patientDetails,
      displayMeds,
      cleanFindings,
      handwrittenText,
    };
  }, [activeDoc]);

  const handleAddMedicine = () => {
    if (!newMedName.trim() || !activeDoc) return;
    const medName = newMedName.trim();
    const dosage = newMedDosage.trim() || 'unclear';
    const frequency = newMedFreq.trim() || 'unclear';

    const parts = [medName];
    if (dosage !== 'unclear') parts.push(dosage);
    if (frequency !== 'unclear') parts.push(frequency);
    const newSummary = parts.join(' ');

    const updatedMeds = [...(activeDoc.medicines || []), newSummary];
    const newStructured: StructuredMedicine = {
      medicine_name: medName,
      dosage,
      frequency,
      duration: 'unclear',
      instructions: 'unclear',
      confidence: 'verified',
    };
    const updatedStructured = [...(activeDoc.structuredMedicines || parsedData?.structuredMeds || []), newStructured];

    updateDraftDocument(activeDoc.id, {
      medicines: updatedMeds,
      structuredMedicines: updatedStructured,
    });

    setNewMedName('');
    setNewMedDosage('');
    setNewMedFreq('');
  };

  const handleRemoveMedicine = (index: number) => {
    if (!activeDoc) return;
    const currentMeds = activeDoc.medicines.length > 0 ? activeDoc.medicines : (parsedData?.displayMeds || []);
    const currentStructured = activeDoc.structuredMedicines || parsedData?.structuredMeds || [];

    const updatedMeds = currentMeds.filter((_, i) => i !== index);
    const updatedStructured = currentStructured.filter((_, i) => i !== index);

    updateDraftDocument(activeDoc.id, {
      medicines: updatedMeds,
      structuredMedicines: updatedStructured,
    });
  };

  const processFiles = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsScanning(true);
    setOcrError(null);

    let lastCreatedId: string | null = null;
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const countPrefix = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
      setScanStepText(`${countPrefix}Analyzing ${file.name}...`);

      try {
        const result = await ocrService.processDocument(file, ({ message }) => {
          setScanStepText(`${countPrefix}${file.name}: ${message}`);
        });

        if (!result.ok) {
          errors.push(`"${file.name}": ${result.errorMessage ?? 'OCR processing failed.'}`);
          continue;
        }

        const rawType = result.documentType.toLowerCase();
        let docType: OCRDocument['type'] = 'Prescription';
        if (
          rawType.includes('scan') ||
          rawType.includes('mri') ||
          rawType.includes('ct') ||
          rawType.includes('radiol') ||
          rawType.includes('xray') ||
          rawType.includes('ecg') ||
          rawType.includes('ekg') ||
          rawType.includes('echo') ||
          rawType.includes('ultrasound') ||
          rawType.includes('usg')
        ) {
          docType = 'Scan Report';
        } else if (rawType.includes('discharge')) {
          docType = 'Discharge Summary';
        } else if (rawType.includes('lab') || rawType.includes('blood') || rawType.includes('pathol') || rawType.includes('report') || rawType.includes('test')) {
          docType = 'Lab Report';
        }

        const newId = 'doc-' + Math.floor(100 + Math.random() * 900);
        const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

        const newDoc: OCRDocument = {
          id: newId,
          name: file.name || `Document_${newId}`,
          type: docType,
          date: today,
          doctorName: result.doctorName || result.patientDetails?.doctorName || 'Not detected',
          medicines: result.medicines,
          structuredMedicines: result.structuredMedicines,
          patientDetails: result.patientDetails,
          handwrittenText: result.handwrittenText,
          findings: result.diagnosis || result.extractedText.slice(0, 300) || 'No findings extracted',
          confidenceScore: result.confidence,
          rawExtractedText: result.extractedText,
        };

        addDraftDocument(newDoc);
        lastCreatedId = newId;
      } catch (err: any) {
        errors.push(`"${file.name}": ${err.message || 'Error occurred during processing'}`);
      }
    }

    if (errors.length > 0) {
      setOcrError(errors.join(' | '));
    }
    if (lastCreatedId) {
      setSelectedDocId(lastCreatedId);
    }
    setIsScanning(false);
  }, [addDraftDocument]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processFiles(files);
    }
    e.target.value = '';
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleCameraCapture = (file: File) => {
    setShowCamera(false);
    processFiles([file]);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <AnimatePresence>
        {showCamera && (
          <CameraModal
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white/95 backdrop-blur-sm rounded-[28px] border border-[#D8E3DC] shadow-[0_12px_32px_-8px_rgba(13,59,54,0.06)] p-6 sm:p-10 space-y-7"
        >
          {/* Header */}
          <div className="border-b border-[#E8EFEA] pb-5">
            <div className="flex items-center space-x-2 text-xs font-bold text-[#145A4D] uppercase tracking-wider mb-2">
              <span className="w-6 h-6 rounded-lg bg-[#E5F3EB] flex items-center justify-center text-[#145A4D]">
                <FileText className="w-3.5 h-3.5" />
              </span>
              <span>Step 04 • Prescription OCR Scanner & Camera Feed</span>
            </div>

            <h2 className="font-['Plus_Jakarta_Sans','Manrope'] text-2xl sm:text-3xl font-extrabold text-[#142B25] tracking-tight">
              {currentLanguage === 'or' ? 'ପୂର୍ବର ଔଷଧ ପତ୍ର କିମ୍ବା ରିପୋର୍ଟ ସ୍କାନ କରନ୍ତୁ' : 'Prescription & Report Scanner'}
            </h2>

            <p className="text-sm text-[#5B736B] mt-1 font-medium leading-relaxed">
              Place your doctor's prescription slip on the kiosk scanner glass or upload PDF/photos for instant multimodal medical digitization.
            </p>
          </div>

          {/* Action Buttons: Upload & Live Camera */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              id="btn-upload-document"
              onClick={openFilePicker}
              disabled={isScanning}
              className="h-24 bg-[#F8FAF7] hover:bg-[#E5F3EB]/60 hover:border-[#145A4D] border-2 border-[#D8E3DC] rounded-2xl flex items-center space-x-4 p-5 transition-all cursor-pointer group disabled:opacity-50 shadow-xs"
            >
              <div className="w-13 h-13 rounded-2xl bg-white border border-[#D8E3DC] text-[#145A4D] flex items-center justify-center group-hover:scale-105 group-hover:border-[#145A4D] transition-transform shadow-xs">
                <Upload className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-[#142B25] uppercase tracking-wide">Upload Documents / Reports</p>
                <p className="text-xs text-[#5B736B]">Select one or multiple files (Prescription, MRI, CT, Lab)</p>
              </div>
            </button>

            <button
              type="button"
              id="btn-take-photo"
              onClick={() => setShowCamera(true)}
              disabled={isScanning}
              className="h-24 bg-[#F8FAF7] hover:bg-[#E5F3EB]/60 hover:border-[#145A4D] border-2 border-[#D8E3DC] rounded-2xl flex items-center space-x-4 p-5 transition-all cursor-pointer group disabled:opacity-50 shadow-xs"
            >
              <div className="w-13 h-13 rounded-2xl bg-white border border-[#D8E3DC] text-[#145A4D] flex items-center justify-center group-hover:scale-105 group-hover:border-[#145A4D] transition-transform shadow-xs">
                <Camera className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-[#142B25] uppercase tracking-wide">Live Camera Scan</p>
                <p className="text-xs text-[#5B6560]">Capture document on kiosk tray</p>
              </div>
            </button>
          </div>

          {/* OCR Error Banner */}
          <AnimatePresence>
            {ocrError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-start space-x-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-xs"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">OCR Processing Notice</p>
                  <p className="mt-0.5 break-words">{ocrError}</p>
                </div>
                <button onClick={() => setOcrError(null)} className="shrink-0 hover:opacity-70 transition-opacity">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scanning & OCR Animation */}
          {isScanning && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#E5F3EB]/70 border-2 border-[#145A4D]/30 rounded-2xl p-8 relative overflow-hidden"
            >
              <div className="animate-scanline" />
              <div className="flex flex-col items-center justify-center space-y-3 text-center py-4">
                <RefreshCw className="w-10 h-10 text-[#145A4D] animate-spin stroke-[2.2]" />
                <div>
                  <p className="text-base font-bold text-[#142B25] font-['Plus_Jakarta_Sans','Manrope']">{scanStepText}</p>
                  <p className="text-xs text-[#5B736B] mt-1 font-medium">
                    Multimodal clinical OCR parsing prescriptions, scan reports, and lab findings...
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Extracted Document Information Section */}
          {activeDoc && !isScanning && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#142B25] uppercase tracking-wider flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#145A4D]" />
                  <span>Attached Documents ({currentDraft.documents.length})</span>
                </span>
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="text-xs font-bold text-[#145A4D] hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Attach Another File</span>
                </button>
              </div>

              {currentDraft.documents.length > 0 && (
                <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                  {currentDraft.documents.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center space-x-1.5 ${
                        activeDoc.id === doc.id
                          ? 'bg-[#124E43] text-white shadow-xs'
                          : 'bg-[#F8FAF7] text-[#5B736B] border border-[#D8E3DC] hover:border-[#145A4D]'
                      }`}
                    >
                      <span className="truncate max-w-[140px] sm:max-w-[200px]">{doc.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        activeDoc.id === doc.id ? 'bg-[#0B352E] text-emerald-200' : 'bg-[#E5F3EB] text-[#145A4D]'
                      }`}>
                        {doc.type}
                      </span>
                      {currentDraft.documents.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeDraftDocument(doc.id);
                            if (selectedDocId === doc.id) {
                              const remaining = currentDraft.documents.filter((d) => d.id !== doc.id);
                              setSelectedDocId(remaining[0]?.id || null);
                            }
                          }}
                          className={`p-0.5 rounded-full hover:bg-black/10 transition-colors ml-0.5 ${
                            activeDoc.id === doc.id ? 'text-white' : 'text-[#5B736B]'
                          }`}
                          title="Remove document"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-[#F8FAF7] rounded-[24px] border border-[#D8E3DC] p-6 space-y-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#E8EFEA] pb-4">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-[#124E43] text-white flex items-center justify-center shadow-xs">
                      <FileCheck className="w-6 h-6 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-extrabold text-[#142B25]">{activeDoc.name}</span>
                        <span className="text-[10px] font-bold text-[#145A4D] bg-[#E5F3EB] px-2.5 py-0.5 rounded-full border border-[#D8E3DC]">
                          High-Confidence OCR
                        </span>
                      </div>
                      <p className="text-xs text-[#5B736B] mt-0.5">
                        Extraction Confidence: <span className="font-bold text-[#145A4D]">{activeDoc.confidenceScore}%</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-[#5B736B] block font-medium">Scanned Date</span>
                    <span className="text-xs font-bold text-[#142B25]">{activeDoc.date}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-[#D8E3DC]">
                    <span className="text-xs font-bold text-[#5B736B] uppercase tracking-wider block">
                      Classification
                    </span>
                    <p className="text-sm font-bold text-[#142B25] mt-1">{activeDoc.type}</p>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-[#D8E3DC]">
                    <span className="text-xs font-bold text-[#5B736B] uppercase tracking-wider block">
                      Prescribing Doctor / Facility
                    </span>
                    <p className="text-sm font-bold text-[#142B25] mt-1">
                      {activeDoc.doctorName && activeDoc.doctorName !== 'Not detected'
                        ? activeDoc.doctorName
                        : parsedData?.patientDetails.doctorName || 'Not detected'}
                    </p>
                  </div>

                  {/* Digitized Medication Chips */}
                  <div className="bg-white p-4 rounded-2xl border border-[#D8E3DC] md:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#5B736B] uppercase tracking-wider block">
                        Digitized Medications (AI Bounding Box Parsed)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingMeds(!isEditingMeds)}
                        className="text-xs text-[#145A4D] font-bold flex items-center space-x-1 cursor-pointer hover:underline"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{isEditingMeds ? 'Done Editing' : 'Edit Medicines'}</span>
                      </button>
                    </div>

                    {isEditingMeds && (
                      <div className="mt-3 p-3 bg-[#F8FAF7] rounded-xl border border-[#D8E3DC] space-y-2">
                        <span className="text-[11px] font-bold text-[#142B25] block">Add New Medicine</span>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <input
                            type="text"
                            placeholder="Medicine name (e.g. Paracetamol)"
                            value={newMedName}
                            onChange={(e) => setNewMedName(e.target.value)}
                            className="text-xs px-3 py-2 rounded-lg border border-[#D1DDD6] bg-white sm:col-span-2 focus:outline-none focus:border-[#145A4D]"
                          />
                          <input
                            type="text"
                            placeholder="Dosage (e.g. 500mg, 4ml)"
                            value={newMedDosage}
                            onChange={(e) => setNewMedDosage(e.target.value)}
                            className="text-xs px-3 py-2 rounded-lg border border-[#D1DDD6] bg-white focus:outline-none focus:border-[#145A4D]"
                          />
                          <input
                            type="text"
                            placeholder="Freq (e.g. TDS, BID, q8h)"
                            value={newMedFreq}
                            onChange={(e) => setNewMedFreq(e.target.value)}
                            className="text-xs px-3 py-2 rounded-lg border border-[#D1DDD6] bg-white focus:outline-none focus:border-[#145A4D]"
                          />
                        </div>
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={handleAddMedicine}
                            disabled={!newMedName.trim()}
                            className="px-4 py-1.5 bg-[#124E43] disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center space-x-1 cursor-pointer hover:bg-[#0B352E]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Prescription Item</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {(parsedData?.displayMeds && parsedData.displayMeds.length > 0) || activeDoc.medicines.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {(activeDoc.medicines.length > 0 ? activeDoc.medicines : (parsedData?.displayMeds || [])).map((med, i) => (
                          <div
                            key={i}
                            className="bg-[#E5F3EB]/70 border border-[#C6DDD2] text-[#142B25] text-xs font-bold px-3 py-1.5 rounded-full flex items-center space-x-1.5 shadow-xs"
                          >
                            <span className="w-2 h-2 rounded-full bg-[#145A4D]" />
                            <span>{med}</span>
                            {isEditingMeds && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMedicine(i)}
                                className="text-red-500 hover:text-red-700 ml-1 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#5B736B] italic mt-1">No medicines detected in report</p>
                    )}
                  </div>

                  {/* CLINICAL FINDINGS & INDICATIONS — Organised Section */}
                  <div className="bg-white p-5 rounded-2xl border border-[#D8E3DC] md:col-span-2 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[#E8EFEA] pb-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#E5F3EB] text-[#145A4D] flex items-center justify-center">
                          <Stethoscope className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs sm:text-sm font-extrabold text-[#142B25] uppercase tracking-wider">
                            Clinical Findings & Indications
                          </h4>
                          <p className="text-[11px] text-[#5B736B]">
                            AI Multimodal Extraction (Donut OCR + Ollama VLM Architecture)
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-[#145A4D] bg-[#E5F3EB] px-2.5 py-1 rounded-full border border-[#C6DDD2] flex items-center space-x-1">
                        <Sparkles className="w-3 h-3 text-[#145A4D]" />
                        <span>AI Structured</span>
                      </span>
                    </div>

                    {/* Prescription Demographics & Vitals */}
                    {(parsedData?.patientDetails.name ||
                      parsedData?.patientDetails.date ||
                      parsedData?.patientDetails.age ||
                      parsedData?.patientDetails.weight ||
                      parsedData?.cleanFindings ||
                      parsedData?.patientDetails.vitals) && (
                      <div className="bg-[#F8FAF7] border border-[#D8E3DC] rounded-xl p-3.5 space-y-2.5">
                        <span className="text-[10px] font-bold text-[#5B736B] uppercase tracking-wider block">
                          Prescription Demographics & Vitals
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                          {parsedData.patientDetails.name && (
                            <div className="bg-white p-2.5 rounded-lg border border-[#E8EFEA]">
                              <span className="text-[10px] text-[#5B736B] flex items-center space-x-1">
                                <User className="w-3 h-3 text-[#145A4D]" />
                                <span>Patient Name</span>
                              </span>
                              <span className="font-bold text-[#142B25] block mt-0.5">{parsedData.patientDetails.name}</span>
                            </div>
                          )}
                          {parsedData.patientDetails.date && (
                            <div className="bg-white p-2.5 rounded-lg border border-[#E8EFEA]">
                              <span className="text-[10px] text-[#5B736B] flex items-center space-x-1">
                                <Calendar className="w-3 h-3 text-[#145A4D]" />
                                <span>Prescription Date</span>
                              </span>
                              <span className="font-bold text-[#142B25] block mt-0.5">{parsedData.patientDetails.date}</span>
                            </div>
                          )}
                          {(parsedData.patientDetails.age || parsedData.patientDetails.gender) && (
                            <div className="bg-white p-2.5 rounded-lg border border-[#E8EFEA]">
                              <span className="text-[10px] text-[#5B736B] block">Age / Gender</span>
                              <span className="font-bold text-[#142B25] block mt-0.5">
                                {[parsedData.patientDetails.age, parsedData.patientDetails.gender]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </span>
                            </div>
                          )}
                          {parsedData.patientDetails.weight && (
                            <div className="bg-white p-2.5 rounded-lg border border-[#E8EFEA]">
                              <span className="text-[10px] text-[#5B736B] block">Patient Weight</span>
                              <span className="font-bold text-[#142B25] block mt-0.5">{parsedData.patientDetails.weight}</span>
                            </div>
                          )}
                          {parsedData.cleanFindings && (
                            <div className="bg-white p-2.5 rounded-lg border border-[#E8EFEA] col-span-2 sm:col-span-1">
                              <span className="text-[10px] text-[#5B736B] flex items-center space-x-1">
                                <HeartPulse className="w-3 h-3 text-[#145A4D]" />
                                <span>Clinical Findings</span>
                              </span>
                              <span className="font-bold text-[#142B25] line-clamp-1 block mt-0.5">{parsedData.cleanFindings}</span>
                            </div>
                          )}
                        </div>
                        {parsedData.patientDetails.vitals && (
                          <div className="pt-2 border-t border-[#E8EFEA] flex items-center space-x-2 text-xs">
                            <Activity className="w-3.5 h-3.5 text-[#145A4D]" />
                            <span className="text-[#5B736B] font-medium">Recorded Vitals:</span>
                            <span className="font-bold text-[#142B25]">{parsedData.patientDetails.vitals}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI Handwritten Prescription (Ollama VLM) — Matching Sample */}
                    <div className="space-y-4">
                      {/* Handwritten Text Block */}
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="bg-[#2563EB] text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider shadow-xs">
                            Handwritten Text
                          </span>
                        </div>
                        <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-3.5 text-[#F8FAFC] font-mono text-xs leading-relaxed shadow-inner">
                          {parsedData?.handwrittenText ? (
                            <pre className="whitespace-pre-line font-mono font-medium text-slate-100 text-xs sm:text-sm">
                              {parsedData.handwrittenText}
                            </pre>
                          ) : (
                            <p className="text-slate-400 italic font-sans text-xs">No handwritten lines isolated</p>
                          )}
                        </div>
                      </div>

                      {/* Structured Medication Table */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#142B25] uppercase tracking-wider flex items-center space-x-1.5">
                            <Pill className="w-3.5 h-3.5 text-[#145A4D]" />
                            <span>Prescriptions & Dosage Table</span>
                          </span>
                          <span className="text-[11px] text-[#5B736B] font-medium">
                            {parsedData?.structuredMeds.length || 0} medicines formatted
                          </span>
                        </div>

                        {parsedData?.structuredMeds && parsedData.structuredMeds.length > 0 ? (
                          <div className="overflow-x-auto rounded-xl border border-[#D8E3DC] shadow-xs">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-[#1E293B] text-slate-200 font-bold border-b border-[#334155]">
                                <tr>
                                  <th className="py-2.5 px-3">Medicine</th>
                                  <th className="py-2.5 px-3">Dosage</th>
                                  <th className="py-2.5 px-3">Frequency</th>
                                  <th className="py-2.5 px-3">Duration</th>
                                  <th className="py-2.5 px-3">Instructions</th>
                                  <th className="py-2.5 px-3 text-center">Confidence</th>
                                  {isEditingMeds && <th className="py-2.5 px-3 text-center">Action</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E8EFEA] bg-white">
                                {parsedData.structuredMeds.map((med, idx) => (
                                  <tr key={idx} className="hover:bg-[#F8FAF7] transition-colors">
                                    <td className="py-3 px-3 font-bold text-[#142B25]">
                                      {med.medicine_name}
                                    </td>
                                    <td className="py-3 px-3 text-[#142B25] font-medium">
                                      {med.dosage !== 'unclear' ? (
                                        <span className="bg-[#E5F3EB] text-[#145A4D] font-bold px-2 py-0.5 rounded-md text-[11px]">
                                          {med.dosage}
                                        </span>
                                      ) : (
                                        <span className="text-[#8FA39A] italic">unclear</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-[#142B25]">
                                      {med.frequency !== 'unclear' ? (
                                        <span className="font-semibold text-[#145A4D]">{med.frequency}</span>
                                      ) : (
                                        <span className="text-[#8FA39A] italic">unclear</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-[#5B736B]">
                                      {med.duration !== 'unclear' ? (
                                        <span className="font-semibold text-[#142B25]">{med.duration}</span>
                                      ) : (
                                        <span className="text-[#8FA39A] italic">unclear</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-[#5B736B]">
                                      {med.instructions !== 'unclear' ? (
                                        <span>{med.instructions}</span>
                                      ) : (
                                        <span className="text-[#8FA39A] italic">unclear</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      <span
                                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                          med.confidence === 'high'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : med.confidence === 'low'
                                            ? 'bg-rose-100 text-rose-800'
                                            : 'bg-amber-100 text-amber-800'
                                        }`}
                                      >
                                        {med.confidence || 'medium'}
                                      </span>
                                    </td>
                                    {isEditingMeds && (
                                      <td className="py-3 px-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveMedicine(idx)}
                                          className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 cursor-pointer"
                                          title="Remove prescription item"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-4 bg-white rounded-xl border border-[#D8E3DC] text-center">
                            <p className="text-xs text-[#5B736B] italic">
                              No structured medication rows detected. Verify handwritten image quality or edit manually.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E8EFEA]">
            <button
              type="button"
              onClick={onBack}
              className="h-14 px-8 bg-white hover:bg-[#F2F5F3] text-[#142B25] font-bold text-sm rounded-full border border-[#D1DDD6] shadow-xs flex items-center space-x-2 transition-all cursor-pointer active:scale-98"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={onNext}
              className="h-14 px-9 bg-[#124E43] hover:bg-[#0B352E] text-white font-['Plus_Jakarta_Sans','Manrope'] font-bold text-sm sm:text-base rounded-full shadow-md hover:shadow-lg flex items-center space-x-2 transition-all cursor-pointer group active:scale-98"
            >
              <span>Continue to AYUSH Assessment</span>
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

        </motion.div>
      </div>
    </>
  );
};
