// import React, { useEffect, useRef } from "react";

// interface CustomEditorProps {
//   initialData?: string;
//   onChange?: (data: string) => void;
// }

// const CustomEditor: React.FC<CustomEditorProps> = ({ initialData, onChange }) => {
//   const editorRef = useRef<HTMLDivElement>(null);
//   const editorInstanceRef = useRef<any>(null);

//   useEffect(() => {
//     const style = document.createElement("style");
//     style.innerHTML = `.cke_notifications_area { display: none !important; }`;
//     document.head.appendChild(style);
//     return () => {
//       document.head.removeChild(style);
//     };
//   }, []);

//   useEffect(() => {
//     const script = document.createElement("script");
//     script.charset = "utf-8";
//     script.src = "https://cdn.ckeditor.com/4.14.0/full-all/ckeditor.js";

//     script.onload = () => {
//       if (window.CKEDITOR && editorRef.current) {
//         window.CKEDITOR.env.isCompatible = true;

//         // Tạo editor nếu chưa được tạo
//         if (!editorInstanceRef.current) {
//           editorInstanceRef.current = window.CKEDITOR.replace(editorRef.current, {
//             language: "vi",
//             entities: false,
//             basicEntities: false,
//             entities_latin: false,
//             entities_greek: false,
//             forcePasteAsPlainText: true,
//             fillEmptyBlocks: false,
//             forceSimpleAmpersand: true,
//           });

//           editorInstanceRef.current.on("instanceReady", () => {
//             if (initialData) {
//               editorInstanceRef.current.setData(initialData);
//             }

//             editorInstanceRef.current.on("change", () => {
//               const data = editorInstanceRef.current.getData();
//               onChange?.(data);
//             });
//           });

//           editorInstanceRef.current.on("error", (event: any) => {
//             console.error("CKEditor error:", event);
//           });
//         } else if (initialData) {
//           // Nếu editor đã được tạo, set lại dữ liệu mới
//           editorInstanceRef.current.setData(initialData);
//         }
//       }
//     };

//     document.body.appendChild(script);

//     return () => {
//       if (editorInstanceRef.current) {
//         editorInstanceRef.current.destroy(true);
//       }
//       document.body.removeChild(script);
//     };
//   }, [initialData]);

//   return <div ref={editorRef}></div>;
// };

// export default CustomEditor;
