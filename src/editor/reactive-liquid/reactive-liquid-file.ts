import * as monaco from 'reactive-liquid-monaco-editor'
import * as ts from 'typescript'
import { initWorkersAndProviders } from './utils';

export type ReactiveLiquidFile={
    reactiveLiquid:monaco.editor.ITextModel,
    typescript:monaco.editor.ITextModel;
    css:monaco.editor.ITextModel;
}
export async function createFile(path:string,filename:string):Promise<ReactiveLiquidFile>{
    
    const workersAndProviders = await initWorkersAndProviders();

    const file={
        reactiveLiquid  :monaco.editor.createModel('',  'reactive-liquid' ,monaco.Uri.file(`${path}/${filename}.rl`)),
        typescript      :monaco.editor.createModel('',  'typescript'      ,monaco.Uri.file(`${path}/${filename}.tsx`)),
        css             :monaco.editor.createModel('',  'css'             ,monaco.Uri.file(`${path}/${filename}.css`)),
    }

    file.reactiveLiquid['ReactiveFile']=file;
    
    file.reactiveLiquid.onDidChangeContent(async (e)=>{
        console.log(getFinalTypescriptDocument(file.reactiveLiquid.getValue()))
        file.typescript.setValue(getTypescriptDocument(file.reactiveLiquid.getValue()));
        file.css.setValue(getCssDocument(file.reactiveLiquid.getValue()));
        // Diagnostics managements
        const promises:any[] = [];
        const tsMarkers=await workersAndProviders.typescript.getDiagnostics(file.typescript);
        const cssMarkers=await workersAndProviders.css.getDiagnostics(file.css);
        monaco.editor.setModelMarkers(file.reactiveLiquid,'reactive-liquid',[...tsMarkers,...cssMarkers]);
            
    })

    return file;
}

export function isInsideStyleRegion(
	documentText: string,
    offset:number
) {
    
	const file=ts.createSourceFile("_isInsideStyle.tsx",documentText,ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
   
    let content = documentText
    .split('\n')
    .map(line => {
        return ' '.repeat(line.length);
    }).join('\n');
    
    let inStyleTs=false;
    return find(file)

    function find(node: ts.Node | undefined): boolean | undefined {
        if (!node) {
            return false;
        }
        if(node.kind==ts.SyntaxKind.JsxElement){
            
            if(node["openingElement"]['tagName'].escapedText=='style'){
              
                content   = content.slice(0, node["openingElement"].end) + documentText.slice(node["openingElement"].end ,node["closingElement"].pos) + content.slice(node["closingElement"].pos);
                if(offset>=node["openingElement"].end && offset<= node["closingElement"].pos){
           
                    if(node["children"].length!=0){
                        var tsInStyle = content.matchAll(/<%((?!%>)(.|\s))*%>/gm);
                        Array.from(tsInStyle).map(ts=>{
                            if(offset>= ts.index!+1 && offset<=  ts.index!+ts[0].length-1){
                                inStyleTs= true;
                            }
                        })
                        return !inStyleTs;
                    }
                    else{
                        if(offset>=node["openingElement"].end && offset<=node["closingElement"].pos){
                            
                            return true;
                        }
                    }
                }
            }
        }
        return ts.forEachChild(node, find);
    }
}

export function getCssDocument(
	documentText: string,
) {
    var virtualFileName="_cssDocument.tsx";
	const node=ts.createSourceFile(virtualFileName,documentText, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
   
    let content = documentText
		.split('\n')
		.map(line => {
			return ' '.repeat(line.length);
		}).join('\n');
        
    var result=find(node)
    return content;

    function  find(node: ts.Node | undefined): boolean | undefined {
        if (!node) {
            return false;
        }

        // Is this a JsxElement with an identifier name?
       
        if(node.kind==ts.SyntaxKind.JsxElement){
            if(node["openingElement"]['tagName'].escapedText=='style'){
                if(node["children"].length!=0){
                    var start=node["children"][0].pos;
                    var end = node["children"][node["children"].length-1].end;
                    var styleSource=documentText.slice(start,end)
                    var tsInStyle = styleSource.matchAll(/<%((?!%>)(.|\s))*%>/gm);
                        Array.from(tsInStyle).map(ts=>{
                            styleSource=styleSource.slice(0,ts.index!)+ '@__;'+(' '.repeat(ts[0].length-4))+ styleSource.slice(ts.index!+ts[0].length);
                        })
                    content = content.slice(0, start) + styleSource + content.slice(end);
                    
                }
            }
        }

        return ts.forEachChild(node, find);
        
    }
}

export function getTypescriptDocument(
	documentText: string,
) {
    var virtualFileName="_typescriptDocument.tsx";
	const node=ts.createSourceFile(virtualFileName,documentText, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
    
    let content =  documentText;
    let spaces= documentText
    .split('\n')
    .map(line => {
        return ' '.repeat(line.length);
    }).join('\n');
        
    let res=find(node)
    return content;

    function find(node: ts.Node | undefined): boolean | undefined {
        if (!node) {
            return false;
        }
        // Is this a JsxElement with an identifier name?
        if(node.kind==ts.SyntaxKind.JsxElement){
            
            if(node["openingElement"]['tagName'].escapedText=='style'){
                
                var originalCssSource=documentText.slice(node["openingElement"].end,node["closingElement"].pos);
                var cssSource= originalCssSource;//.replaceAll(/{/g,"[OPEN]").replaceAll(/}/g,"[CLOSE]");
         
                //\$\{(\{([^{}]|(?1))*\})\}   // may work
                cssSource=cssSource.replaceAll(/{/gm,'↑').replaceAll(/}/gm,'↓')
                var tsInStyle = cssSource.matchAll(/<%((?!%>)(.|\s))*%>/gm);
                Array.from(tsInStyle).map(ts=>{
                    var inStyleScript = ts[0].replaceAll('<%', '{ ').replaceAll('%>', ' }').replaceAll('↑','{').replaceAll('↓','}');
                    cssSource=cssSource.slice(0,ts.index!)+ inStyleScript + cssSource.slice(ts.index!+ts[0].length)
                })
                cssSource=cssSource.replaceAll('↑',' ').replaceAll('↓',' ');
                content=content.slice(0,node["openingElement"].end)+cssSource+content.slice(node["closingElement"].pos);
                
               
            }
        }

        return ts.forEachChild(node, find);
        
    }
}


export function getFinalTypescriptDocument(
	documentText: string,
) {
    var virtualFileName="_finalTypescriptDocument.tsx";
	const node=ts.createSourceFile(virtualFileName,documentText, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
    
    let content =  documentText;
    let spaces= documentText
    .split('\n')
    .map(line => {
        return ' '.repeat(line.length);
    }).join('\n');
        
    let res=find(node)
    return content.replaceAll('↑','&#123;').replaceAll('↓','&#125;');

    function find(node: ts.Node | undefined): boolean | undefined {
        if (!node) {
            return false;
        }
        // Is this a JsxElement with an identifier name?
        if(node.kind==ts.SyntaxKind.JsxElement){
            
            if(node["openingElement"]['tagName'].escapedText=='style'){
                
                var originalCssSource=documentText.slice(node["openingElement"].end,node["closingElement"].pos);
                var cssSource= originalCssSource;//.replaceAll(/{/g,"[OPEN]").replaceAll(/}/g,"[CLOSE]");
         
                //\$\{(\{([^{}]|(?1))*\})\}   // may work
                cssSource=cssSource.replaceAll(/{/gm,'↑').replaceAll(/}/gm,'↓')
                var tsInStyle = cssSource.matchAll(/<%((?!%>)(.|\s))*%>/gm);
                Array.from(tsInStyle).map(ts=>{
                    var inStyleScript = ts[0].replaceAll('<%', '{ ').replaceAll('%>', ' }').replaceAll('↑','{').replaceAll('↓','}');
                    cssSource=cssSource.slice(0,ts.index!)+ inStyleScript + cssSource.slice(ts.index!+ts[0].length)
                })
                //cssSource=cssSource.replaceAll('↑',' ').replaceAll('↓',' ');
                content=content.slice(0,node["openingElement"].end)+cssSource+content.slice(node["closingElement"].pos);
                
               
            }
        }

        return ts.forEachChild(node, find);
        
    }
}