import { compile, stripMetadata } from './compiler';
import { hasDelegateCall } from './bytecode-scanner';

interface ImplementationInfo {
  type: 'address' | 'storageSlot' | 'unknown';
  value?: string;
}

interface AnalysisResult {
  isProxy: boolean;
  implementation?: ImplementationInfo;
  reason?: string;
  details?: any;
}

export function detectProxy(source: string, originalBytecode: string, fileName: string = 'Contract.sol'): AnalysisResult {
  const hasDelegate = hasDelegateCall(originalBytecode);
  if (!hasDelegate) return { isProxy: false, reason: 'No DELEGATECALL opcode found in bytecode.' };

  let compilationResult;
  try {
    compilationResult = compile(source, fileName);
  } catch (e: any) {
    return { isProxy: true, reason: `Compilation failed: ${e.message}` };
  }

  const { bytecode: compiledBytecode, ast } = compilationResult;
  const strippedOriginal = stripMetadata(originalBytecode);
  const strippedCompiled = stripMetadata(compiledBytecode);

  if (strippedOriginal !== strippedCompiled) {
    return { isProxy: true, reason: 'Bytecode mismatch: The provided source code does not match the bytecode.' };
  }

  const delegateCalls = findDelegateCalls(ast);
  if (delegateCalls.length === 0) return { isProxy: true, reason: 'DELEGATECALL found in bytecode but not detected in AST (Potential obfuscation).' };

  for (const call of delegateCalls) {
    const analysis = analyzeDelegateCall(call, ast);
    if (analysis.isProxy) {
      const implementation = extractImplementation(call, ast, originalBytecode, source);
      return { isProxy: true, reason: analysis.reason, details: call, implementation };
    }
  }

  return { isProxy: false, reason: 'No unsafe proxy patterns detected.' };
}

// ... AST Traversal ...
interface AstNode { nodeType: string; [key: string]: any; }

function findDelegateCalls(ast: AstNode): AstNode[] {
  const calls: AstNode[] = [];
  function visit(node: AstNode) {
    if (!node) return;
    if (node.nodeType === 'FunctionCall') {
      if (node.kind === 'functionCall' &&
          node.expression &&
          node.expression.nodeType === 'MemberAccess' &&
          node.expression.memberName === 'delegatecall') {
        calls.push(node);
      }
    }
    if (node.nodeType === 'InlineAssembly') {
      if (node.AST) visitYul(node.AST, calls);
    }
    for (const key in node) {
      if (typeof node[key] === 'object' && node[key] !== null) {
        if (Array.isArray(node[key])) node[key].forEach((child: any) => visit(child));
        else visit(node[key]);
      }
    }
  }
  function visitYul(node: any, calls: any[]) {
      if (!node) return;
      if (node.nodeType === 'YulFunctionCall') {
          if (node.functionName && node.functionName.name === 'delegatecall') {
              calls.push({ nodeType: 'YulDelegateCall', ...node });
          }
      }
      for (const key in node) {
        if (typeof node[key] === 'object' && node[key] !== null) {
           if (Array.isArray(node[key])) node[key].forEach((child: any) => visitYul(child, calls));
           else visitYul(node[key], calls);
        }
      }
  }
  visit(ast);
  return calls;
}

function analyzeDelegateCall(node: AstNode, rootAst: AstNode): { isProxy: boolean, reason?: string } {
  if (node.nodeType === 'FunctionCall') {
    const expression = node.expression;
    const targetExpression = expression.expression;
    if (isSafeExpression(targetExpression, rootAst)) return { isProxy: false };
    else return { isProxy: true, reason: 'Delegatecall to dynamic or non-constant target found (High-level).' };
  }
  if (node.nodeType === 'YulDelegateCall') {
      const args = node.arguments;
      if (args && args.length >= 2) {
          const target = args[1];
          if (isSafeYulExpression(target)) return { isProxy: false };
          else return { isProxy: true, reason: 'Delegatecall to dynamic target found (Assembly).' };
      }
  }
  return { isProxy: true, reason: 'Unknown delegatecall pattern' };
}

function isSafeExpression(node: AstNode, rootAst: AstNode): boolean {
    if (!node) return false;
    if (node.nodeType === 'Literal') return true;
    if (node.nodeType === 'FunctionCall' && (node.kind === 'typeConversion' || node.kind === 'functionCall')) {
        if (node.arguments && node.arguments.length > 0) return isSafeExpression(node.arguments[0], rootAst);
    }
    if (node.nodeType === 'Identifier') {
        const referencedDeclarationId = node.referencedDeclaration;
        if (referencedDeclarationId) {
            const decl = findDeclaration(rootAst, referencedDeclarationId);
            if (decl) {
                if (decl.mutability === 'constant' || decl.mutability === 'immutable') return true;
                if (decl.nodeType === 'ContractDefinition' && decl.contractKind === 'library') return true;
            }
        }
    }
    if (node.nodeType === 'MemberAccess') return isSafeExpression(node.expression, rootAst);
    return false;
}

function isSafeYulExpression(node: any): boolean { return node.nodeType === 'YulLiteral'; }

function findDeclaration(ast: AstNode, id: number): AstNode | null {
    let result: AstNode | null = null;
    function visit(node: AstNode) {
        if (!node || result) return;
        if (node.id === id) { result = node; return; }
        for (const key in node) {
            if (typeof node[key] === 'object' && node[key] !== null) {
                 if (Array.isArray(node[key])) node[key].forEach((child: any) => visit(child));
                 else visit(node[key]);
            }
        }
    }
    visit(ast);
    return result;
}

// --- Implementation Extraction ---

function extractImplementation(node: AstNode, rootAst: AstNode, originalBytecode: string, source: string): ImplementationInfo {
    const eip1967Slot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

    if (originalBytecode.includes('363d3d373d3d3d363d73')) {
        const match = originalBytecode.match(/363d3d373d3d3d363d73([a-fA-F0-9]{40})5af4/);
        if (match && match[1]) return { type: 'address', value: '0x' + match[1] };
    }

    const slots = findSloadConstants(rootAst, source);
    const normalizedSlots = slots.map(s => {
        let clean = s.toLowerCase();
        // If it's a decimal string, convert to hex
        if (/^\d+$/.test(clean)) {
             try { clean = '0x' + BigInt(clean).toString(16); } catch(e) {}
        }
        if (!clean.startsWith('0x')) clean = '0x' + clean;
        return clean;
    });

    if (normalizedSlots.includes(eip1967Slot)) {
        return { type: 'storageSlot', value: eip1967Slot };
    }

    if (normalizedSlots.length > 0) {
        return { type: 'storageSlot', value: normalizedSlots[0] };
    }

    return { type: 'unknown' };
}

function findSloadConstants(ast: AstNode, source: string): string[] {
    const slots: string[] = [];

    function visit(node: AstNode) {
        if (!node) return;

        if (node.nodeType === 'YulFunctionCall' && node.functionName && node.functionName.name === 'sload') {
            const args = node.arguments;
            if (args && args.length > 0) {
                const arg = args[0];
                let val: string | null = null;

                if (arg.nodeType === 'YulLiteral') {
                    if (arg.kind === 'number') {
                         if (arg.hexValue) val = '0x' + arg.hexValue;
                         else val = arg.value;
                    }
                } else if (arg.nodeType === 'YulIdentifier') {
                    const name = arg.name;
                    // Improved regex: handle optional 'internal' and type
                    // "bytes32 constant X = ..." or "bytes32 internal constant X = ..."
                    // Also type might differ.
                    // Just look for "constant NAME = VALUE"
                    const regex = new RegExp(`constant\\s+${name}\\s*=\\s*(0x[a-fA-F0-9]+|\\d+)`);
                    const match = source.match(regex);
                    if (match && match[1]) {
                        val = match[1];
                    }
                }

                if (val && !slots.includes(val)) slots.push(val);
            }
        }

        for (const key in node) {
            if (typeof node[key] === 'object' && node[key] !== null) {
                 if (Array.isArray(node[key])) {
                     node[key].forEach((child: any) => visit(child));
                 } else {
                     visit(node[key]);
                 }
            }
        }
    }
    visit(ast);
    return slots;
}
