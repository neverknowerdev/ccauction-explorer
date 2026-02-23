import { compile, stripMetadata } from './compiler';
import { hasDelegateCall } from './bytecode-scanner';

interface AnalysisResult {
  isProxy: boolean;
  reason?: string;
  details?: any;
}

export function detectProxy(source: string, originalBytecode: string, fileName: string = 'Contract.sol'): AnalysisResult {

  // 1. Bytecode Pre-Scan (Fast Path)
  const hasDelegate = hasDelegateCall(originalBytecode);

  if (!hasDelegate) {
    return { isProxy: false, reason: 'No DELEGATECALL opcode found in bytecode.' };
  }

  // 2. Compile Source
  let compilationResult;
  try {
    compilationResult = compile(source, fileName);
  } catch (e: any) {
    // If we can't compile, we can't verify source.
    // If bytecode has delegatecall, but we can't verify source, it's safer to flag or warn.
    // But per requirements "If no source code - we should fail the check".
    // "So we have access to source-code".
    // If compilation fails, source is likely invalid.
    return { isProxy: true, reason: `Compilation failed: ${e.message}` };
  }

  const { bytecode: compiledBytecode, ast } = compilationResult;

  // 3. Verify Bytecode
  const strippedOriginal = stripMetadata(originalBytecode);
  const strippedCompiled = stripMetadata(compiledBytecode);

  if (strippedOriginal !== strippedCompiled) {
    return { isProxy: true, reason: 'Bytecode mismatch: The provided source code does not match the bytecode.' };
  }

  // 4. AST Analysis
  const delegateCalls = findDelegateCalls(ast);

  if (delegateCalls.length === 0) {
      // Bytecode has delegatecall, but AST doesn't show it.
      // This implies hidden or obfuscated delegatecall (e.g. unchecked assembly block that parser missed, or mismatch).
      // Since we verified bytecode matches source, it means our AST parser missed it.
      // Or it's in a standard library part we didn't traverse?
      // We should be conservative.
      return { isProxy: true, reason: 'DELEGATECALL found in bytecode but not detected in AST (Potential obfuscation).' };
  }

  // 5. Analyze each delegate call
  for (const call of delegateCalls) {
    const analysis = analyzeDelegateCall(call, ast);
    if (analysis.isProxy) {
      return { isProxy: true, reason: analysis.reason, details: call };
    }
  }

  return { isProxy: false, reason: 'No unsafe proxy patterns detected.' };
}

// --- AST Traversal ---

interface AstNode {
  nodeType: string;
  [key: string]: any;
}

function findDelegateCalls(ast: AstNode): AstNode[] {
  const calls: AstNode[] = [];

  function visit(node: AstNode) {
    if (!node) return;

    // High-level delegatecall: address(t).delegatecall(data)
    if (node.nodeType === 'FunctionCall') {
      if (node.kind === 'functionCall' &&
          node.expression &&
          node.expression.nodeType === 'MemberAccess' &&
          node.expression.memberName === 'delegatecall') {
        calls.push(node);
      }
    }

    // Low-level assembly delegatecall
    if (node.nodeType === 'InlineAssembly') {
      // Yul AST usually in `AST` or `externalReferences`
      if (node.AST) {
         visitYul(node.AST, calls);
      }
    }

    // Recurse
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

  function visitYul(node: any, calls: any[]) {
      if (!node) return;

      // YulFunctionCall: delegatecall(...)
      if (node.nodeType === 'YulFunctionCall') {
          if (node.functionName && node.functionName.name === 'delegatecall') {
              calls.push({ nodeType: 'YulDelegateCall', ...node });
          }
      }

      for (const key in node) {
        if (typeof node[key] === 'object' && node[key] !== null) {
           if (Array.isArray(node[key])) {
             node[key].forEach((child: any) => visitYul(child, calls));
           } else {
             visitYul(node[key], calls);
           }
        }
      }
  }

  visit(ast);
  return calls;
}

// --- Analysis Logic ---

function analyzeDelegateCall(node: AstNode, rootAst: AstNode): { isProxy: boolean, reason?: string } {
  // Case 1: High-level Solidity delegatecall
  if (node.nodeType === 'FunctionCall') {
    const expression = node.expression;
    const targetExpression = expression.expression;

    if (isSafeExpression(targetExpression, rootAst)) {
        return { isProxy: false };
    } else {
        return { isProxy: true, reason: 'Delegatecall to dynamic or non-constant target found (High-level).' };
    }
  }

  // Case 2: Yul/Assembly delegatecall
  if (node.nodeType === 'YulDelegateCall') {
      // Arguments: gas, target, ...
      const args = node.arguments;
      if (args && args.length >= 2) {
          const target = args[1];
          if (isSafeYulExpression(target)) {
              return { isProxy: false };
          } else {
              return { isProxy: true, reason: 'Delegatecall to dynamic target found (Assembly).' };
          }
      }
  }

  return { isProxy: true, reason: 'Unknown delegatecall pattern' };
}

function isSafeExpression(node: AstNode, rootAst: AstNode): boolean {
    if (!node) return false;

    // 1. Literal address: address(0x...)
    if (node.nodeType === 'Literal') return true;

    // 2. Type conversion: address(CONST)
    if (node.nodeType === 'FunctionCall' && (node.kind === 'typeConversion' || node.kind === 'functionCall')) {
        if (node.arguments && node.arguments.length > 0) {
            return isSafeExpression(node.arguments[0], rootAst);
        }
    }

    // 3. Identifier: variable or constant
    if (node.nodeType === 'Identifier') {
        const referencedDeclarationId = node.referencedDeclaration;
        if (referencedDeclarationId) {
            const decl = findDeclaration(rootAst, referencedDeclarationId);
            if (decl) {
                // Check if constant or immutable
                if (decl.mutability === 'constant' || decl.mutability === 'immutable') {
                    return true;
                }
                // Check if it's a library
                if (decl.nodeType === 'ContractDefinition' && decl.contractKind === 'library') {
                    return true;
                }
            }
        }
    }

    // 4. Member Access (e.g., Lib.foo)
    if (node.nodeType === 'MemberAccess') {
        return isSafeExpression(node.expression, rootAst);
    }

    return false;
}

function isSafeYulExpression(node: any): boolean {
    if (node.nodeType === 'YulLiteral') return true;
    return false;
}

function findDeclaration(ast: AstNode, id: number): AstNode | null {
    let result: AstNode | null = null;

    function visit(node: AstNode) {
        if (!node || result) return;
        if (node.id === id) {
            result = node;
            return;
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
    return result;
}
