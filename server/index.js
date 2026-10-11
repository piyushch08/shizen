const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { PDFDocument } = require('pdf-lib');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(cors());
app.use(express.json());

require('dotenv').config();
const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');
const ilovepdf = new ILovePDFApi(
  process.env.ILOVEPDF_PUBLIC_KEY || 'test_public_key',
  process.env.ILOVEPDF_SECRET_KEY || 'test_secret_key'
);

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});

// Ensure directories exist
['uploads', 'output'].forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Helper to cleanup files
const cleanup = (...files) => {
  files.forEach(file => {
    if (file && fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch (e) { /* ignore */ }
    }
  });
};

// ========================
// IMAGE PROCESSING
// ========================
app.post('/api/process/image', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { width, height, format, quality, maintainAspectRatio, cropX, cropY, cropWidth, cropHeight } = req.body;
  const inputPath = req.file.path;
  const outFormat = format || 'jpeg';
  const outputPath = path.join(__dirname, 'output', `${req.file.filename}.${outFormat}`);

  try {
    let pipeline = sharp(inputPath);
    const metadata = await pipeline.metadata();

    // Crop if provided
    if (cropWidth && cropHeight) {
      const cx = parseInt(cropX || 0);
      const cy = parseInt(cropY || 0);
      const cw = parseInt(cropWidth);
      const ch = parseInt(cropHeight);

      const safeX = Math.max(0, Math.min(cx, metadata.width - 1));
      const safeY = Math.max(0, Math.min(cy, metadata.height - 1));
      const safeW = Math.max(1, Math.min(cw, metadata.width - safeX));
      const safeH = Math.max(1, Math.min(ch, metadata.height - safeY));

      pipeline = pipeline.extract({
        left: safeX,
        top: safeY,
        width: safeW,
        height: safeH
      });
    }

    // Resize if width or height is provided
    if (width || height) {
      const resizeOpts = {
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        fit: maintainAspectRatio === 'true' ? 'inside' : 'fill',
        withoutEnlargement: false,
      };
      pipeline = pipeline.resize(resizeOpts);
    }

    // Format & Quality
    const q = quality ? Math.max(1, Math.min(100, parseInt(quality))) : 80;

    switch (outFormat) {
      case 'jpeg':
      case 'jpg':
        pipeline = pipeline.jpeg({ quality: q, mozjpeg: true });
        break;
      case 'png':
        pipeline = pipeline.png({ quality: q, compressionLevel: 9 });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: q });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality: q });
        break;
      case 'pdf':
        // Fallback handled below
        break;
      default:
        pipeline = pipeline.jpeg({ quality: q });
    }

    if (outFormat === 'pdf') {
      const imgBuffer = await pipeline.jpeg({ quality: q, mozjpeg: true }).toBuffer();
      const metadataFinal = await sharp(imgBuffer).metadata();
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([metadataFinal.width, metadataFinal.height]);
      const imageEmbed = await pdfDoc.embedJpg(imgBuffer);
      page.drawImage(imageEmbed, { x: 0, y: 0, width: metadataFinal.width, height: metadataFinal.height });
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(outputPath, pdfBytes);
    } else {
      await pipeline.toFile(outputPath);
    }

    const originalName = req.file.originalname;
    const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    const downloadName = `${baseName}_compressed.${outFormat}`;

    res.download(outputPath, downloadName, () => {
      cleanup(inputPath, outputPath);
    });
  } catch (err) {
    console.error('Image processing error:', err);
    cleanup(inputPath, outputPath);
    res.status(500).json({ error: 'Failed to process image: ' + err.message });
  }
});

// ========================
// VIDEO PROCESSING
// ========================
app.post('/api/process/video', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { width, height, format, videoBitrate, startTime, duration, cropX, cropY, cropWidth, cropHeight, maintainAspectRatio } = req.body;
  const inputPath = req.file.path;
  const outFormat = format || 'mp4';
  const outputPath = path.join(__dirname, 'output', `${req.file.filename}.${outFormat}`);

  let command = ffmpeg(inputPath);

  if (startTime) command = command.setStartTime(startTime);
  if (duration) command = command.setDuration(duration);

  // Build video filters for resize (ffmpeg needs even numbers)
  const videoFilters = [];

  if (cropWidth && cropHeight) {
    const cx = parseInt(cropX || 0);
    const cy = parseInt(cropY || 0);
    const cw = parseInt(cropWidth);
    const ch = parseInt(cropHeight);
    videoFilters.push(`crop=${cw}:${ch}:${cx}:${cy}`);
  }
  if (width || height) {
    const w = width ? parseInt(width) : -2;
    const h = height ? parseInt(height) : -2;

    if (width && height && maintainAspectRatio === 'true') {
      // Force original aspect ratio and ensure even dimensions
      videoFilters.push(`scale=w=${w}:h=${h}:force_original_aspect_ratio=decrease`);
      // Next filter ensures dimensions are even
      videoFilters.push(`scale=trunc(iw/2)*2:trunc(ih/2)*2`);
    } else {
      const scaleW = width ? `trunc(${w}/2)*2` : '-2';
      const scaleH = height ? `trunc(${h}/2)*2` : '-2';
      videoFilters.push(`scale=${scaleW}:${scaleH}`);
    }
  }

  if (videoFilters.length > 0) {
    command = command.videoFilters(videoFilters);
  }

  // Compression / Bitrate
  if (videoBitrate) {
    command = command.videoBitrate(videoBitrate);
  }

  // Audio settings
  command = command.audioBitrate('128k');

  const originalName = req.file.originalname;
  const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  const downloadName = `${baseName}_compressed.${outFormat}`;

  command
    .format(outFormat)
    .on('start', (cmdline) => {
      console.log('FFmpeg started:', cmdline);
    })
    .on('progress', (progress) => {
      if (progress.percent) {
        console.log(`Processing: ${Math.round(progress.percent)}% done`);
      }
    })
    .on('end', () => {
      console.log('Video processing finished');
      res.download(outputPath, downloadName, () => {
        cleanup(inputPath, outputPath);
      });
    })
    .on('error', (err) => {
      console.error('Video processing error:', err);
      cleanup(inputPath, outputPath);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process video: ' + err.message });
      }
    })
    .save(outputPath);
});

// ========================
// AUDIO PROCESSING
// ========================
app.post('/api/process/audio', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { format, audioBitrate, startTime, duration, enhance, noiseReduction, voiceClarity, volumeNormalization, deEsser, bassCut } = req.body;
  const inputPath = req.file.path;
  const outFormat = format || 'mp3';
  const outputPath = path.join(__dirname, 'output', `${req.file.filename}.${outFormat}`);

  let command = ffmpeg(inputPath);

  if (startTime) command = command.setStartTime(startTime);
  if (duration) command = command.setDuration(duration);

  // Audio Bitrate
  if (audioBitrate) {
    command = command.audioBitrate(audioBitrate);
  }

  // Audio Enhancement
  if (enhance === 'true' || enhance === true) {
    const filters = [];
    const nRed = parseInt(noiseReduction) || 0;
    const vClar = parseInt(voiceClarity) || 0;
    const vNorm = parseInt(volumeNormalization) || 0;
    const isDeEss = deEsser === 'true' || deEsser === true;
    const isBassCut = bassCut === 'true' || bassCut === true;

    // 1. Low-end Rumble / Handling Noise Filter
    if (isBassCut || vClar > 0) {
      const hpFreq = isBassCut ? 120 : Math.round(60 + (vClar / 100) * 80); // 60Hz to 140Hz
      filters.push(`highpass=f=${hpFreq}`);
    }

    // 2. Intelligent Multi-Stage Noise Suppression
    if (nRed > 0) {
      // Stage 2a: Adaptive Noise Gate (silences room noise / fan during pauses)
      if (nRed >= 25) {
        // Maps 25-100% to -52dB to -30dB threshold
        const gateThresh = Math.round(-52 + ((nRed - 25) / 75) * 22);
        const ratio = Math.min(8, 2 + Math.round((nRed / 100) * 6));
        filters.push(`agate=threshold=${gateThresh}dB:ratio=${ratio}:attack=8:release=220`);
      }

      // Stage 2b: FFT Noise Reduction (removes continuous hiss/hum/whine)
      // nr: 12 to 55 dB reduction
      const nr = Math.min(60, Math.round(12 + (nRed / 100) * 45));
      // nf: -40 to -85 dB noise floor
      const nf = Math.round(-45 - (nRed / 100) * 40);
      filters.push(`afftdn=nr=${nr}:nf=${nf}:nt=w`);
    }

    // 3. Voice Clarity & Spectral Enhancement
    if (vClar > 0) {
      // Cut boxy / muddy low-mids (around 320Hz - 400Hz) if clarity is dialed up
      if (vClar > 40) {
        const mudCut = -Math.round(((vClar - 40) / 60) * 3.5); // Up to -3.5dB
        filters.push(`equalizer=f=350:width_type=h:width=250:g=${mudCut}`);
      }

      // Boost vocal presence & intelligibility (around 3.2kHz)
      if (vClar > 15) {
        const presenceGain = Math.round((vClar / 100) * 9); // Up to +9dB
        filters.push(`equalizer=f=3200:width_type=h:width=1800:g=${presenceGain}`);
      }

      // Add high-end crispness & vocal air (around 8.5kHz)
      if (vClar > 55) {
        const airGain = Math.round(((vClar - 55) / 45) * 4.5); // Up to +4.5dB
        filters.push(`equalizer=f=8500:width_type=h:width=3000:g=${airGain}`);
      }
    }

    // 4. De-Esser (controls harsh sibilance / sharp 's' sounds)
    if (isDeEss || (vClar > 60 && isDeEss !== false)) {
      filters.push(`deesser=i=0.4:m=0.5:f=0.5:s=o`);
    }

    // 5. Volume Normalization & Dynamic Range Control
    if (vNorm > 0) {
      // Compressor to smooth peaks and bring up quiet speech
      if (vNorm > 15) {
        const compRatio = 2 + (vNorm / 100) * 3; // 2 to 5 ratio
        const makeup = Math.round((vNorm / 100) * 3);
        filters.push(`acompressor=threshold=-18dB:ratio=${compRatio.toFixed(1)}:attack=15:release=160:makeup=${makeup}`);
      }

      // EBU R128 Loudness Normalization for broadcast-standard consistency
      if (vNorm >= 65) {
        filters.push(`loudnorm=I=-16:LRA=11:TP=-1.5`);
      } else if (vNorm > 35) {
        filters.push(`volume=1.3`);
      }
    }

    if (filters.length > 0) {
      command = command.audioFilters(filters.join(','));
    }
  }

  // Ensure no video stream is included (in case a video was uploaded for audio extraction)
  command = command.noVideo();

  const originalName = req.file.originalname;
  const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  const downloadName = `${baseName}_optimized.${outFormat}`;

  command
    .format(outFormat)
    .on('start', (cmdline) => {
      console.log('FFmpeg Audio started:', cmdline);
    })
    .on('progress', (progress) => {
      if (progress.percent) {
        console.log(`Audio Processing: ${Math.round(progress.percent)}% done`);
      }
    })
    .on('end', () => {
      console.log('Audio processing finished');
      res.download(outputPath, downloadName, () => {
        cleanup(inputPath, outputPath);
      });
    })
    .on('error', (err) => {
      console.error('Audio processing error:', err);
      cleanup(inputPath, outputPath);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process audio: ' + err.message });
      }
    })
    .save(outputPath);
});

// ========================
// DOCUMENT PROCESSING (PDF)
// ========================
app.post('/api/process/document', upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const inputPaths = req.files.map(f => f.path);
  const outputPath = path.join(__dirname, 'output', `optimized_${Date.now()}.pdf`);

  try {
    // 1. Create a virtual merged document from all uploaded PDFs
    const tempDoc = await PDFDocument.create();
    for (const file of req.files) {
      if (file.mimetype === 'application/pdf') {
        const fileBytes = fs.readFileSync(file.path);
        const pdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        const copiedPages = await tempDoc.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => tempDoc.addPage(page));
      }
    }

    const { pageOrder } = req.body;
    let finalDoc;

    // 2. If pageOrder is provided, pick pages in exact sequence
    if (pageOrder) {
      finalDoc = await PDFDocument.create();
      const seqStr = pageOrder.split(',').map(s => s.trim()).filter(s => s);
      const indicesToCopy = [];

      for (const s of seqStr) {
        if (s.includes('-')) {
          const [startStr, endStr] = s.split('-');
          const start = parseInt(startStr, 10) - 1;
          const end = parseInt(endStr, 10) - 1;
          if (!isNaN(start) && !isNaN(end)) {
            const step = start <= end ? 1 : -1;
            for (let i = start; step === 1 ? i <= end : i >= end; i += step) {
              if (i >= 0 && i < tempDoc.getPageCount()) {
                indicesToCopy.push(i);
              }
            }
          }
        } else {
          const p = parseInt(s, 10) - 1;
          if (!isNaN(p) && p >= 0 && p < tempDoc.getPageCount()) {
            indicesToCopy.push(p);
          }
        }
      }

      if (indicesToCopy.length > 0) {
        const copiedPages = await finalDoc.copyPages(tempDoc, indicesToCopy);
        copiedPages.forEach((page) => finalDoc.addPage(page));
      } else {
        finalDoc = tempDoc; // Fallback if invalid
      }
    } else {
      finalDoc = tempDoc; // No specific order, keep all
    }

    // 3. Optimize: strip all metadata
    finalDoc.setTitle('');
    finalDoc.setAuthor('');
    finalDoc.setSubject('');
    finalDoc.setKeywords([]);
    finalDoc.setProducer('');
    finalDoc.setCreator('');

    const savedBytes = await finalDoc.save({
      useObjectStreams: false,
    });

    fs.writeFileSync(outputPath, savedBytes);

    const originalName = req.files[0].originalname;
    const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    const downloadName = `${baseName}_optimized.pdf`;

    res.download(outputPath, downloadName, () => {
      cleanup(...inputPaths, outputPath);
    });
  } catch (err) {
    console.error('Document processing error:', err);
    cleanup(...inputPaths, outputPath);
    res.status(500).json({ error: 'Failed to process document: ' + err.message });
  }
});

// ========================
// MERGE PROCESSING (PDFs & Images)
// ========================
app.post('/api/process/merge', upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length < 2) return res.status(400).json({ error: 'At least 2 files required' });

  const outputPath = path.join(__dirname, 'output', `merged_${Date.now()}.pdf`);
  const inputPaths = req.files.map(f => f.path);

  try {
    const mergedPdf = await PDFDocument.create();

    for (const file of req.files) {
      const fileBytes = fs.readFileSync(file.path);

      if (file.mimetype === 'application/pdf') {
        const pdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } else if (file.mimetype.startsWith('image/')) {
        // Embed image
        let image;
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
          image = await mergedPdf.embedJpg(fileBytes);
        } else if (file.mimetype === 'image/png') {
          image = await mergedPdf.embedPng(fileBytes);
        } else {
          // Convert unsupported images (webp, avif) to png via sharp first
          const pngBuffer = await sharp(fileBytes).png().toBuffer();
          image = await mergedPdf.embedPng(pngBuffer);
        }

        const dims = image.scale(1);
        const page = mergedPdf.addPage([dims.width, dims.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: dims.width,
          height: dims.height,
        });
      }
    }

    const savedBytes = await mergedPdf.save({ useObjectStreams: false });
    fs.writeFileSync(outputPath, savedBytes);

    res.download(outputPath, 'merged_document.pdf', () => {
      cleanup(...inputPaths, outputPath);
    });
  } catch (err) {
    console.error('Merge processing error:', err);
    cleanup(...inputPaths, outputPath);
    res.status(500).json({ error: 'Failed to merge files: ' + err.message });
  }
});

// ========================
// FORMAT CONVERSION (PDF <-> PPT/PPTX, PDF -> JPG, Image -> PDF)
// ========================
app.post('/api/process/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { targetFormat } = req.body; // 'pdf', 'pptx', 'jpg', or 'imagepdf'
  const inputPath = req.file.path;
  const originalName = req.file.originalname;
  const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;

  const outFormat = (targetFormat === 'pdf' || targetFormat === 'imagepdf') ? 'pdf' : (targetFormat === 'jpg' ? 'zip' : 'pptx');
  const downloadName = targetFormat === 'jpg' ? `${baseName}_images.zip` : `${baseName}_converted.${outFormat}`;
  const outputPath = path.join(__dirname, 'output', `${req.file.filename}.${outFormat}`);

  try {
    let task;
    if (targetFormat === 'pdf') {
      task = ilovepdf.newTask('officepdf'); // Office to PDF
    } else if (targetFormat === 'imagepdf') {
      task = ilovepdf.newTask('imagepdf'); // Image to PDF
    } else if (targetFormat === 'jpg') {
      task = ilovepdf.newTask('pdfjpg'); // PDF to JPG
    } else {
      task = ilovepdf.newTask('pdfpowerpoint'); // PDF to PPTX
    }

    await task.start();
    const iloveFile = new ILovePDFFile(inputPath);
    await task.addFile(iloveFile);
    await task.process();
    const data = await task.download();

    fs.writeFileSync(outputPath, data);

    res.download(outputPath, downloadName, () => {
      cleanup(inputPath, outputPath);
    });
  } catch (err) {
    console.error('ILovePDF Conversion error:', err);
    cleanup(inputPath, outputPath);
    res.status(500).json({ error: 'Conversion failed: ' + err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || 'Internal server error occurred during processing.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
