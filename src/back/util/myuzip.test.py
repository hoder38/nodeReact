import unittest
import os
import subprocess
import zipfile
import shutil
import tempfile

class TestMyuzip(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.script_path = os.path.abspath('src/back/util/myuzip.py')
        self.zip_path = os.path.join(self.test_dir, 'test.zip')
        self.output_dir = os.path.join(self.test_dir, 'output')
        os.makedirs(self.output_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def create_zip(self, files, password=None):
        if password:
            temp_files_dir = tempfile.mkdtemp(dir=self.test_dir)
            for name, content in files.items():
                file_path = os.path.join(temp_files_dir, name)
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                with open(file_path, 'w') as f:
                    f.write(content)
            # Use 7z to create password protected zip
            cmd = ['7z', 'a', f'-p{password}', self.zip_path, temp_files_dir + '/.']
            subprocess.run(cmd, capture_output=True, check=True)
            shutil.rmtree(temp_files_dir)
        else:
            with zipfile.ZipFile(self.zip_path, 'w') as zf:
                for name, content in files.items():
                    zf.writestr(name, content)

    def test_password_extraction(self):
        # Test password protected zip extraction
        secret_content = 'this is a secret'
        self.create_zip({'secret.txt': secret_content}, password='123')
        
        # Test extraction
        result = self.run_script([self.zip_path, self.output_dir, 'secret.txt', '123'])
        self.assertEqual(result.returncode, 0)
        self.assertIn('Extracting secret.txt', result.stdout)
        
        with open(os.path.join(self.output_dir, 'secret.txt'), 'r') as f:
            self.assertEqual(f.read(), secret_content)

    def run_script(self, args):
        cmd = ['python3', self.script_path] + args
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result

    def test_list_files(self):
        self.create_zip({'file1.txt': 'content1', 'dir/file2.txt': 'content2'})
        result = self.run_script([self.zip_path])
        self.assertEqual(result.returncode, 0)
        self.assertIn('file1.txt', result.stdout)
        self.assertIn('dir/file2.txt', result.stdout)

    def test_extract_all(self):
        self.create_zip({'file1.txt': 'content1', 'dir/file2.txt': 'content2'})
        result = self.run_script([self.zip_path, self.output_dir])
        self.assertEqual(result.returncode, 0)
        self.assertTrue(os.path.exists(os.path.join(self.output_dir, 'file1.txt')))
        self.assertTrue(os.path.exists(os.path.join(self.output_dir, 'dir/file2.txt')))
        
        with open(os.path.join(self.output_dir, 'file1.txt'), 'r') as f:
            self.assertEqual(f.read(), 'content1')

    def test_extract_single(self):
        self.create_zip({'file1.txt': 'content1', 'file2.txt': 'content2'})
        result = self.run_script([self.zip_path, self.output_dir, 'file2.txt'])
        self.assertEqual(result.returncode, 0)
        self.assertFalse(os.path.exists(os.path.join(self.output_dir, 'file1.txt')))
        self.assertTrue(os.path.exists(os.path.join(self.output_dir, 'file2.txt')))

    def test_encoding_gbk(self):
        # GBK "你好" -> b'\xc4\xe3\xba\xc3'
        gbk_name = b'\xc4\xe3\xba\xc3'.decode('cp437')
        self.create_zip({gbk_name: 'gbk content'})
        result = self.run_script([self.zip_path])
        self.assertEqual(result.returncode, 0)
        self.assertIn('你好', result.stdout)

    def test_encoding_big5(self):
        # Big5 "你好" -> b'\xa7\x41\xa6\x6e'
        # b'\xa7\x41' is invalid in GBK, so it will fall back to Big5
        big5_name = b'\xa7\x41\xa6\x6e'.decode('cp437')
        self.create_zip({big5_name: 'big5 content'})
        result = self.run_script([self.zip_path])
        self.assertEqual(result.returncode, 0)
        self.assertIn('你好', result.stdout)

    def test_extraction_path_creation(self):
        self.create_zip({'nested/dir/file.txt': 'content'})
        result = self.run_script([self.zip_path, self.output_dir])
        self.assertEqual(result.returncode, 0)
        self.assertTrue(os.path.exists(os.path.join(self.output_dir, 'nested/dir/file.txt')))

    def test_no_overwrite(self):
        self.create_zip({'file1.txt': 'new content'})
        existing_file = os.path.join(self.output_dir, 'file1.txt')
        with open(existing_file, 'w') as f:
            f.write('old content')
        
        result = self.run_script([self.zip_path, self.output_dir])
        self.assertEqual(result.returncode, 0)
        with open(existing_file, 'r') as f:
            self.assertEqual(f.read(), 'old content')

if __name__ == '__main__':
    unittest.main()
