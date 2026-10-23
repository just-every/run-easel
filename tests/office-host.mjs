// Test-only Office.js boundary. The application always uses Microsoft's host;
// this helper records the objects created by the production adapter and exports
// those same objects as OOXML. It never implements application linking logic.
import JSZip from 'jszip';

const copy = value => JSON.parse(JSON.stringify(value));
const load = function () { return this; };
const collection = items => ({
  items, load,
  getItemAt(i) { if (!this.items[i]) throw new Error('ItemNotFound'); return this.items[i]; },
  getItem(id) { const item = this.items.find(item => item.id === id); if (!item) throw new Error('ItemNotFound'); return item; },
});
const remove = (items, object) => { const index = items.indexOf(object); if (index >= 0) items.splice(index, 1); };

export function createOfficeHost(name = 'PowerPoint', seed = {}) {
  let nextId = seed.nextId ?? 2;
  const settings = copy(seed.settings ?? {}), slides = [], controls = [];
  const id = () => String(nextId++);
  const table = values => ({
    values: copy(values), load,
    get rowCount() { return this.values.length; },
    get columnCount() { return this.values[0].length; },
    getCellOrNullObject(r, c) {
      const self = this;
      return { load, isNullObject: !!self.merged?.includes(`${r},${c}`), get text() { return self.values[r][c]; }, set text(value) { self.values[r][c] = value; } };
    },
  });
  function makeShape(owner, state) {
    const shape = {
      id: state.id ?? id(), type: state.type, name: state.name ?? '',
      left: state.left ?? 0, top: state.top ?? 0, width: state.width ?? 100, height: state.height ?? 100,
      lineFormat: { visible: true, ...state.lineFormat }, load,
      textFrame: { textRange: { text: state.text ?? '' } },
      fill: { image: state.image ?? null, setImage(value) { this.image = value; } },
      delete() { remove(owner.shapes.items, this); },
      getTable() { if (!this.table) throw new Error('InvalidShapeType'); return this.table; },
    };
    if (state.values) shape.table = table(state.values);
    owner.shapes.items.push(shape);
    return shape;
  }
  function makeSlide(state) {
    const slide = { id: state.id ?? id(), shapes: collection([]), load };
    slide.shapes.addTable = (rows, columns, options = {}) => makeShape(slide, { type: 'Table', values: options.values ?? Array.from({ length: rows }, () => Array(columns).fill('')) });
    slide.shapes.addTextBox = text => makeShape(slide, { type: 'TextBox', text });
    slide.shapes.addGeometricShape = () => makeShape(slide, { type: 'GeometricShape' });
    for (const shape of state.shapes ?? []) makeShape(slide, shape);
    slides.push(slide);
    return slide;
  }
  for (const slide of seed.slides ?? [{ id: 'synthetic-easel-1', shapes: [] }]) makeSlide(slide);
  function makeControl(state = {}) {
    const control = {
      id: state.id ?? nextId++, tag: state.tag ?? '', title: state.title ?? '', text: state.text ?? '', load,
      tables: collection((state.tables ?? []).map(values => table(values))), inlinePictures: collection([]),
      insertTable(rows, columns, location, values) { const value = table(values); this.tables.items.push(value); return value; },
      insertText(value) { this.text = value; return { load }; },
      insertInlinePictureFromBase64(image) { return makePicture(this, { image }); },
      delete() { remove(controls, this); },
    };
    for (const picture of state.pictures ?? []) makePicture(control, picture);
    controls.push(control);
    return control;
  }
  function makePicture(control, state) {
    const picture = {
      image: state.image, width: state.width ?? 100, height: state.height ?? 100, lockAspectRatio: state.lockAspectRatio ?? false, altTextDescription: state.altTextDescription ?? '', load,
      insertInlinePictureFromBase64(image, location) {
        if (location !== 'Replace') throw new Error('Test host only implements replacement of an existing picture.');
        const next = makePicture(control, { image }); remove(control.inlinePictures.items, this); return next;
      },
    };
    control.inlinePictures.items.push(picture);
    return picture;
  }
  for (const control of seed.controls ?? []) makeControl(control);
  const host = {
    Office: {
      HostType: { Word: 'Word', PowerPoint: 'PowerPoint' }, AsyncResultStatus: { Succeeded: 'succeeded' },
      context: {
        host: name,
        requirements: { isSetSupported: (api, version) => (api === 'PowerPointApi' && version === '1.8') || (api === 'WordApi' && version === '1.3') },
        document: { settings: {
          get: key => settings[key] === undefined ? undefined : copy(settings[key]),
          set(key, value) { settings[key] = copy(value); },
          saveAsync(callback) { callback({ status: 'succeeded' }); },
        } },
      },
    },
    PowerPoint: {
      GeometricShapeType: { rectangle: 'Rectangle' },
      async run(fn) { return fn({ sync: async () => {}, presentation: { slides: collection(slides), getSelectedSlides: () => collection(slides.filter(slide => host.selectedSlides.includes(slide.id))) } }); },
    },
    Word: {
      async run(fn) { return fn({ sync: async () => {}, document: {
        getSelection: () => ({ getRange: () => ({ insertContentControl: () => makeControl() }) }),
        contentControls: {
          getByTag: tag => collection(controls.filter(control => control.tag === tag)),
          getById: controlId => { const control = controls.find(control => control.id === controlId); if (!control) throw new Error('ItemNotFound'); return control; },
        },
      } }); },
    },
    slides, controls, settings, selectedSlides: [slides[0]?.id],
    snapshot() {
      return { nextId, settings: copy(settings), slides: slides.map(slide => ({ id: slide.id, shapes: slide.shapes.items.map(shapeState) })), controls: controls.map(controlState) };
    },
    reopen() { return createOfficeHost(name, this.snapshot()); },
    deleteTarget(item) {
      if (item.host === 'Word') controls.find(control => control.id === item.target.control)?.delete();
      else slides.find(slide => slide.id === item.target.slide)?.shapes.items.find(shape => shape.id === item.target.shape)?.delete();
    },
    duplicateTarget(item) {
      if (item.host === 'Word') { const source = controls.find(control => control.id === item.target.control); return makeControl({ ...controlState(source), id: nextId++ }); }
      const slide = slides.find(slide => slide.id === item.target.slide), source = slide.shapes.getItem(item.target.shape);
      return makeShape(slide, { ...shapeState(source), id: id() });
    },
    async pptx() { return presentationPackage(this.snapshot()); },
    async docx() { return wordPackage(this.snapshot()); },
  };
  return host;
}

function shapeState(shape) {
  return { id: shape.id, type: shape.type, name: shape.name, left: shape.left, top: shape.top, width: shape.width, height: shape.height, lineFormat: copy(shape.lineFormat), text: shape.textFrame.textRange.text, image: shape.fill.image, ...(shape.table ? { values: copy(shape.table.values) } : {}) };
}
function controlState(control) {
  return { id: control.id, tag: control.tag, title: control.title, text: control.text, tables: control.tables.items.map(t => copy(t.values)), pictures: control.inlinePictures.items.map(p => ({ image: p.image, width: p.width, height: p.height, lockAspectRatio: p.lockAspectRatio, altTextDescription: p.altTextDescription })) };
}

const esc = value => String(value).replace(/[&<>"\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? ''));
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const O = 'application/vnd.openxmlformats-officedocument';
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const rels = entries => XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const xfrm = shape => `<a:xfrm><a:off x="${Math.round(shape.left * 12700)}" y="${Math.round(shape.top * 12700)}"/><a:ext cx="${Math.round(shape.width * 12700)}" cy="${Math.round(shape.height * 12700)}"/></a:xfrm>`;
const textBody = value => `<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(value)}</a:t></a:r></a:p></a:txBody>`;

function shapeXml(shape, numericId, imageId) {
  const props = `<p:cNvPr id="${numericId}" name="${esc(shape.name)}"/>`;
  if (shape.type === 'Table') {
    const width = Math.round(shape.width * 12700 / shape.values[0].length), height = Math.round(shape.height * 12700 / shape.values.length);
    const table = `<a:tbl><a:tblPr/><a:tblGrid>${shape.values[0].map(() => `<a:gridCol w="${width}"/>`).join('')}</a:tblGrid>${shape.values.map(row => `<a:tr h="${height}">${row.map(cell => `<a:tc>${textBody(cell)}<a:tcPr/></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl>`;
    return `<p:graphicFrame><p:nvGraphicFramePr>${props}<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(shape).replace(/a:xfrm/g, 'p:xfrm')}<a:graphic><a:graphicData uri="${A}/table">${table}</a:graphicData></a:graphic></p:graphicFrame>`;
  }
  const fill = imageId ? `<a:blipFill><a:blip r:embed="${imageId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>` : '<a:noFill/>';
  return `<p:sp><p:nvSpPr>${props}<p:cNvSpPr${shape.type === 'TextBox' ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(shape)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}</p:spPr>${textBody(shape.text).replace(/a:txBody/g, 'p:txBody')}</p:sp>`;
}

function customSettings(zip, settings) {
  zip.file('docProps/custom.xml', XML + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${Object.entries(settings).map(([key, value], i) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${esc(key)}"><vt:lpwstr>${esc(JSON.stringify(value))}</vt:lpwstr></property>`).join('')}</Properties>`);
}

function bytes(zip) {
  // Let unchanged-document assertions compare bytes across wall-clock ticks.
  Object.values(zip.files).forEach(file => { file.date = new Date('2000-01-01T00:00:00Z'); });
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function presentationPackage(state) {
  const zip = new JSZip(), slideParts = [];
  state.slides.forEach((slide, i) => {
    const imageRels = [];
    const shapes = slide.shapes.map((shape, j) => {
      const imageId = shape.image ? `rIdImage${j + 1}` : null;
      if (shape.image) {
        const file = `image${i + 1}-${j + 1}.png`;
        zip.file(`ppt/media/${file}`, Buffer.from(shape.image, 'base64'));
        imageRels.push([imageId, 'image', `../media/${file}`]);
      }
      return shapeXml(shape, j + 2, imageId);
    }).join('');
    const part = `/ppt/slides/slide${i + 1}.xml`; slideParts.push(part);
    zip.file(part.slice(1), XML + `<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([['rIdLayout', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ...imageRels]));
  });
  zip.file('[Content_Types].xml', XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="${O}.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${O}.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${O}.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="${O}.theme+xml"/><Override PartName="/docProps/custom.xml" ContentType="${O}.custom-properties+xml"/>${slideParts.map(part => `<Override PartName="${part}" ContentType="${O}.presentationml.slide+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml'], ['rId2', 'custom-properties', 'docProps/custom.xml']]));
  zip.file('ppt/presentation.xml', XML + `<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${state.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', rels([['rIdMaster', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...state.slides.map((_, i) => [`rId${i + 1}`, 'slide', `slides/slide${i + 1}.xml`])]));
  zip.file('ppt/slideMasters/slideMaster1.xml', XML + `<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
  zip.file('ppt/slideLayouts/slideLayout1.xml', XML + `<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  const colors = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map((key, i) => `<a:${key}><a:srgbClr val="${i % 2 ? 'FFFFFF' : '172B26'}"/></a:${key}>`).join('');
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>', line = `<a:ln w="9525">${fill}</a:ln>`, effect = '<a:effectStyle><a:effectLst/></a:effectStyle>';
  const font = '<a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/>';
  zip.file('ppt/theme/theme1.xml', XML + `<a:theme xmlns:a="${A}" name="Easel"><a:themeElements><a:clrScheme name="Easel">${colors}</a:clrScheme><a:fontScheme name="Easel"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme><a:fmtScheme name="Easel"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${effect.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
  customSettings(zip, state.settings);
  return bytes(zip);
}

async function wordPackage(state) {
  if (state.controls.some(control => control.pictures.length)) throw new Error('Word image OOXML serialization is not implemented by this test helper.');
  const zip = new JSZip(), paragraph = text => `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const controls = state.controls.map(control => `<w:sdt><w:sdtPr><w:alias w:val="${esc(control.title)}"/><w:tag w:val="${esc(control.tag)}"/><w:id w:val="${control.id}"/></w:sdtPr><w:sdtContent>${paragraph(control.text)}${control.tables.map(table => `<w:tbl><w:tblPr/><w:tblGrid>${table[0].map(() => '<w:gridCol w="2400"/>').join('')}</w:tblGrid>${table.map(row => `<w:tr>${row.map(cell => `<w:tc>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`).join('')}</w:sdtContent></w:sdt>`).join('');
  zip.file('[Content_Types].xml', XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="${O}.wordprocessingml.document.main+xml"/><Override PartName="/docProps/custom.xml" ContentType="${O}.custom-properties+xml"/></Types>`);
  zip.file('_rels/.rels', rels([['rId1', 'officeDocument', 'word/document.xml'], ['rId2', 'custom-properties', 'docProps/custom.xml']]));
  zip.file('word/document.xml', XML + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${controls}<w:sectPr/></w:body></w:document>`);
  customSettings(zip, state.settings);
  return bytes(zip);
}
