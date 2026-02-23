import { compile, stripMetadata } from './compiler';

interface AnalysisResult {
  isProxy: boolean;
  reason?: string;
  details?: any;
}

export function detectProxy(source: string, originalBytecode: string, fileName: string = 'Contract.sol'): AnalysisResult {
  // 1. Compile source
  let compilationResult;
  try {
    compilationResult = compile(source, fileName);
  } catch (e: any) {
    return { isProxy: false, reason: `Compilation failed: ${e.message}` };
  }

  const { bytecode: compiledBytecode, ast } = compilationResult;

  // 2. Verify Bytecode
  const strippedOriginal = stripMetadata(originalBytecode);
  const strippedCompiled = stripMetadata(compiledBytecode);

  if (strippedOriginal !== strippedCompiled) {
    return { isProxy: true, reason: 'Bytecode mismatch: The provided source code does not match the bytecode.' };
  }

  // 3. AST Analysis
  const delegateCalls = findDelegateCalls(ast);

  // 4. Analyze each delegate call
  for (const call of delegateCalls) {
    const analysis = analyzeDelegateCall(call, ast); // Pass root AST
    if (analysis.isProxy) {
      return { isProxy: true, reason: analysis.reason, details: call };
    }
  }

  return { isProxy: false, reason: 'No proxy patterns detected.' };
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
          node.expression.nodeType === 'MemberAccess' &&
          node.expression.memberName === 'delegatecall') {
        calls.push(node);
      }
    }

    // Low-level assembly delegatecall
    if (node.nodeType === 'InlineAssembly') {
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
              // Add a marker to identify Yul call
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
    // Expression is `address(target).delegatecall`
    // The `expression` is a `MemberAccess` (delegatecall)
    // The `expression.expression` is the target (address(target) or target).
    const expression = node.expression;
    const targetExpression = expression.expression;

    // Check if targetExpression is safe
    if (isSafeExpression(targetExpression, rootAst)) {
        return { isProxy: false };
    } else {
        return { isProxy: true, reason: 'Delegatecall to dynamic or non-constant target found (High-level).' };
    }
  }

  // Case 2: Yul/Assembly delegatecall
  if (node.nodeType === 'YulDelegateCall') {
      // Arguments: gas, target, in, insize, out, outsize
      // Target is 2nd argument (index 1)
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
        // If it's address(X), check X.
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
                // Check if it's a library (ContractDefinition with contractKind 'library')
                if (decl.nodeType === 'ContractDefinition' && decl.contractKind === 'library') {
                    return true;
                }
            }
        }
    }

    // 4. Member Access (e.g., Lib.foo) where Lib is a library
    if (node.nodeType === 'MemberAccess') {
        // If accessing a library property/function
        return isSafeExpression(node.expression, rootAst);
    }

    return false;
}

function isSafeYulExpression(node: any): boolean {
    // YulLiteral: 0x123... (HexNumber, DecimalNumber, StringLiteral)
    if (node.nodeType === 'YulLiteral') return true;

    // YulFunctionCall could be complex, assume unsafe unless explicitly constant (like memory guard?)

    // YulIdentifier: Check if it refers to a constant? Yul doesn't link to Solidity AST easily here.
    // For bad actor detection, any non-literal delegatecall target in assembly is suspicious.
    // Safe use of assembly delegatecall usually hardcodes the address or reads from an immutable variable (which ends up as PUSH in bytecode but variable access in Yul).
    // If it's an immutable variable, Solc might inline it or use `verbatim`.

    // Let's assume unsafe for now.
    return false;
}

function findDeclaration(ast: AstNode, id: number): AstNode | null {
    // DFS to find node with id
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
