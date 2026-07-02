module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {
        packageImportPath: 'import com.richtexteditor.RichTextEditorPackage;',
        packageInstance: 'new RichTextEditorPackage()',
      },
    },
  },
};
