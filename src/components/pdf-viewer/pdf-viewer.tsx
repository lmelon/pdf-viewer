import { Component, Prop, Element, Event, EventEmitter, Listen, Watch, State } from '@stencil/core';

import { PDFJSStatic, PDFViewerParams, PDFProgressData, PDFDocumentProxy, PDFSource, PDFPageProxy } from 'pdfjs-dist';
import PDFJS from 'pdfjs-dist/build/pdf';
import PDFJSViewer from 'pdfjs-dist/web/pdf_viewer';

declare global {
    const PDFJS: PDFJSStatic;
}

@Component({
    tag: 'st-pdf-viewer',
    styleUrl: 'pdf-viewer.scss',
    shadow: true,
    assetsDir: 'vendor'
})
export class PdfViewerComponent {

    render() {
        return (
            <div id="mainContainer">
                <div class="toolbar">
                    <div class="page-section">
                        <span>Page </span>
                        <button class="prev-btn" title="Previous Page" disabled={this.currentPage === 1}
                            onClick={() => this.prevPage()}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7.5 12.5l9 9v-18z"></path></svg>
                        </button>
                        <input
                            type="number"
                            min="1"
                            max={this.totalPages}
                            value={this.currentPage}
                            onChange={(event) => this.handlePageInput(event)}>
                        </input>
                        <button class="next-btn" title="Next Page" disabled={this.currentPage === this.totalPages}
                            onClick={() => this.nextPage()}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path d="M16.5 12.5l-9 9v-18z"></path>
                            </svg>
                        </button>
                        <span> of </span>
                        <span>{this.totalPages}</span>
                    </div>
                    <button class="toolbar-btn" title="Zoom Out"
                        onClick={() => this.zoomOut()}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M4.5 8h9v2h-9z" opacity=".5"></path>
                            <path d="M9 18a9 9 0 1 1 9-9 9.01 9.01 0 0 1-9 9zM9 2a7 7 0 1 0 7 7 7.008 7.008 0 0 0-7-7z"></path>
                            <path d="M20.556 23.03l-5.793-5.793 2.475-2.475 5.793 5.793a1 1 0 0 1 0 1.414l-1.06 1.06a1 1 0 0 1-1.415.001z" opacity=".66"></path>
                        </svg>
                    </button>
                    <button class="toolbar-btn" title="Zoom In"
                        onClick={() => this.zoomIn()}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path opacity=".5" d="M13.5 8H10V4.5H8V8H4.5v2H8v3.5h2V10h3.5V8z"></path>
                            <path d="M9 18a9 9 0 1 1 9-9 9.01 9.01 0 0 1-9 9zM9 2a7 7 0 1 0 7 7 7.008 7.008 0 0 0-7-7z"></path>
                            <path d="M20.556 23.03l-5.793-5.793 2.475-2.475 5.793 5.793a1 1 0 0 1 0 1.414l-1.06 1.06a1 1 0 0 1-1.415.001z" opacity=".66"></path>
                        </svg>
                    </button>
                    {/* <div>
                        <input
                            onKeyDown={(event) => this.handleSearchNext(event)}
                            onInput={(event) => this.handleSearch(event)}>
                        </input>
                    </div> */}
                </div>
                <div id="viewerContainer">
                    <div class="pdf-viewer"></div>
                </div>
            </div>
        );
    }

    handlePageInput(e) {
        let newPageNumber = parseInt(e.target.value, 10) || 1;
        if (this._pdf) {
            newPageNumber = this.getValidPageNumber(newPageNumber);
        }
        this.page = newPageNumber;
    }

    handleSearch(e) {
        this.pdfFindController.executeCommand('find', {
            caseSensitive: false, findPrevious: false, highlightAll: true, phraseSearch: true, query: e.target.value
        });
    }

    handleSearchNext(e) {
        if (e.key === 'Enter') {
            this.pdfFindController.executeCommand('findagain', {
                caseSensitive: false, findPrevious: false, highlightAll: true, phraseSearch: true, query: e.target.value
            });
        }
    }

    componentWillLoad() {
        PDFJS.GlobalWorkerOptions.workerSrc = `${this.publicPath}vendor/pdf.worker.min.js`;
    }

    @Prop({ context: 'publicPath' }) private publicPath: string;
    @Element() private element: HTMLElement;

    static CSS_UNITS: number = 96.0 / 72.0;

    public pdfLinkService: any;
    public pdfViewer: any;
    public pdfFindController: any;

    @State() currentPage: number = 1;
    @State() totalPages: number;

    private _pdf: PDFDocumentProxy;
    private lastLoaded: string | Uint8Array | PDFSource;
    private resizeTimeout: NodeJS.Timer;

    @Event() afterLoadComplete: EventEmitter;
    @Event() onError: EventEmitter;
    @Event() onProgress: EventEmitter;
    @Event() pageChange: EventEmitter;

    @Listen('window:resize')
    public onPageResize() {
        if (!this.canAutoResize || !this._pdf) {
            return;
        }
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(() => {
            this.updateSize();
        }, 100);
    }

    private _initListeners() {
        // Page change event
        this.element.shadowRoot
            .querySelector('#viewerContainer')
            .addEventListener('pagechange', (e: any) => {
                this.currentPage = e.pageNumber;
                this.pageChange.emit(e.pageNumber);
        })
    }

    @Prop() src: string | Uint8Array | PDFSource;
    @Watch('src')
    srcChanged() {
        this.loadPDF();
    }

    @Prop({mutable: true}) page: number = 1;
    @Watch('page')
    pageChanged(page) {
        this.currentPage = page;
        this.pdfViewer.currentPageNumber = this.currentPage;
    }

    @Prop({mutable: true}) zoom: number = 1;
    @Prop() minZoom: number = 0.25;
    @Prop() maxZoom: number = 4;

    @Prop() rotation: number = 0;

    @Prop() renderText: boolean = true;
    @Prop() originalSize: boolean = false;
    @Prop() stickToPage: boolean = false;
    @Prop() externalLinkTarget: string = 'blank';
    @Prop() canAutoResize: boolean = true;
    @Prop() fitToPage: boolean = false;

    componentDidLoad() {
        this._initListeners();
        this.setupViewer();
        if (this.src) {
            this.loadPDF();
        }
    }

    public setupViewer() {
        PDFJS.disableTextLayer = !this.renderText;

        this.pdfLinkService = new PDFJSViewer.PDFLinkService();
        this.setExternalLinkTarget(this.externalLinkTarget);

        const pdfOptions: PDFViewerParams | any = {
            container: this.element.shadowRoot.querySelector('#viewerContainer'),
            linkService: this.pdfLinkService,
            textLayerMode: this.renderText ? 1 : 0,
            // This will enable forms, which are currently WIP
            // renderInteractiveForms: true
        };

        this.pdfViewer = new PDFJSViewer.PDFViewer(pdfOptions);
        this.pdfLinkService.setViewer(this.pdfViewer);
        this.pdfFindController = new PDFJSViewer.PDFFindController({ pdfViewer: this.pdfViewer });
        this.pdfViewer.setFindController(this.pdfFindController);
    }

    public nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.pdfViewer.currentPageNumber = this.currentPage;
        }
    }

    public prevPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.pdfViewer.currentPageNumber = this.currentPage;
        }
    }

    public zoomOut() {
        this.zoom *= 0.75;
        if (this.zoom < this.minZoom) {
            this.zoom = this.minZoom;
        }
        this.pdfViewer._setScale(this.zoom, this.stickToPage);
    }

    public zoomIn() {
        this.zoom *= 1.25;
        if (this.zoom > this.maxZoom) {
            this.zoom = this.maxZoom;
        }
        this.pdfViewer._setScale(this.zoom, this.stickToPage);
    }

    public updateSize() {
        this._pdf.getPage(this.pdfViewer.currentPageNumber).then((page: PDFPageProxy) => {
            const viewport = page.getViewport(this.zoom, this.rotation);
            let scale = this.zoom;
            let stickToPage = true;

            // Scale the document when it shouldn't be in original size or doesn't fit into the viewport
            if (!this.originalSize || (this.fitToPage && viewport.width > this.element.offsetWidth)) {
                scale = this.getScale(page.getViewport(1).width);
                stickToPage = !this.stickToPage;
            }

            this.pdfViewer._setScale(scale, stickToPage);
        });
    }

    private getValidPageNumber(page: number): number {
        if (page < 1) {
            return 1;
        }
        if (page > this._pdf.numPages) {
            return this._pdf.numPages;
        }
        return page;
    }

    static getLinkTarget(type: string) {
        switch (type) {
            case 'blank':
                return PDFJS.LinkTarget.BLANK;
            case 'none':
                return PDFJS.LinkTarget.NONE;
            case 'self':
                return PDFJS.LinkTarget.SELF;
            case 'parent':
                return PDFJS.LinkTarget.PARENT;
            case 'top':
                return PDFJS.LinkTarget.TOP;
        }
        return null;
    }

    private setExternalLinkTarget(type: string) {
        const linkTarget = PdfViewerComponent.getLinkTarget(type);
        if (linkTarget !== null) {
            this.pdfLinkService.externalLinkTarget = linkTarget;
        }
    }

    private loadPDF() {
        if (!this.src) {
            return;
        }
        if (this.lastLoaded === this.src) {
            this.update();
            return;
        }

        let loadingTask: any = PDFJS.getDocument(this.src);
        loadingTask.onProgress = (progressData: PDFProgressData) => {
            this.onProgress.emit(progressData);
        };

        const src = this.src;
        loadingTask.promise.then((pdf: PDFDocumentProxy) => {
            this._pdf = pdf;
            this.totalPages = this._pdf.numPages;
            this.lastLoaded = src;
            this.afterLoadComplete.emit(pdf);
            this.update();
        }, (error: any) => {
            this.onError.emit(error);
        });
    }

    private update() {
        this.setupViewer();

        if (this.pdfViewer) {
            this.pdfViewer.setDocument(this._pdf);
        }

        if (this.pdfLinkService) {
            this.pdfLinkService.setDocument(this._pdf, null);
        }

        this.pdfRender();
    }

    private pdfRender() {
        this.renderMultiplePages();
    }

    private renderMultiplePages() {
        this.currentPage = this.getValidPageNumber(this.currentPage);

        if (this.rotation !== 0 || this.pdfViewer.pagesRotation !== this.rotation) {
            setTimeout(() => {
                this.pdfViewer.pagesRotation = this.rotation;
            });
        }

        if (this.stickToPage) {
            setTimeout(() => {
                this.pdfViewer.currentPageNumber = this.currentPage;
            });
        }

        this.updateSize();
    }

    static removeAllChildNodes(element: HTMLElement) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    private getScale(viewportWidth: number) {
        const offsetWidth = this.element.offsetWidth - 40;

        if (offsetWidth === 0) {
            return 1;
        }

        return this.zoom * (offsetWidth / viewportWidth) / PdfViewerComponent.CSS_UNITS;
    }

}
